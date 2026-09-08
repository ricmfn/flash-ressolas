import { getAccessToken } from "./auth.js";
import type { ServiceAccountKey } from "../config.js";

/**
 * Cliente minimo do Google Drive (so upload de arquivo + tornar publico), implementado
 * so com node:crypto/fetch — mesmo espirito do sheetsClient.ts, sem depender de
 * "googleapis" (indisponivel neste ambiente). Usado para hospedar as fotos enviadas
 * pela drop-off box (o Google Forms guarda fotos no Drive do dono do formulario; aqui a
 * service account guarda no Drive DELA MESMA e compartilha o arquivo publicamente,
 * porque a service account nao tem acesso a uma pasta do usuario sem compartilhamento
 * previo).
 */

const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id";

async function authHeaders(account: ServiceAccountKey): Promise<Record<string, string>> {
  const token = await getAccessToken(account);
  return { Authorization: `Bearer ${token}` };
}

async function parseErrorBody(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { error?: { message?: string } };
    return json.error?.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

/** Envia os bytes de uma imagem pro Drive da service account. Devolve o fileId. */
export async function uploadImageToDrive(
  account: ServiceAccountKey,
  bytes: Buffer,
  mimeType: string,
  filename: string,
): Promise<string> {
  const boundary = `flashressolas-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const metadata = JSON.stringify({ name: filename });
  const prefix = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
    "utf8",
  );
  const suffix = Buffer.from(`\r\n--${boundary}--`, "utf8");
  const body = Buffer.concat([prefix, bytes, suffix]);

  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      ...(await authHeaders(account)),
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Falha ao enviar foto pro Drive (${res.status}): ${await parseErrorBody(res)}`);
  const json = (await res.json()) as { id: string };
  return json.id;
}

/** Compartilha o arquivo como "qualquer pessoa com o link pode ver" (leitura). */
export async function makeFilePublic(account: ServiceAccountKey, fileId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: "POST",
    headers: { ...(await authHeaders(account)), "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  if (!res.ok) throw new Error(`Falha ao tornar a foto pública (${res.status}): ${await parseErrorBody(res)}`);
}

/** Faz as duas etapas (upload + compartilhar) e devolve um link no formato que o app já entende (shared/drive.ts). */
export async function uploadPublicPhoto(
  account: ServiceAccountKey,
  bytes: Buffer,
  mimeType: string,
  filename: string,
): Promise<string> {
  const fileId = await uploadImageToDrive(account, bytes, mimeType, filename);
  await makeFilePublic(account, fileId);
  return `https://drive.google.com/file/d/${fileId}/view`;
}
