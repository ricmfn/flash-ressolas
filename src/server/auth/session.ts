import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sessao persistente sem biblioteca de JWT: um token simples "payload.assinatura",
 * assinado com HMAC-SHA256 usando SESSION_SECRET. Guardado num cookie httpOnly de
 * longa duracao para sobreviver a fechar/abrir o app no celular.
 */

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(payload: string, secret: string): string {
  return base64url(createHmac("sha256", secret).update(payload).digest());
}

export function createSessionToken(username: string, secret: string): string {
  const payload = base64url(JSON.stringify({ u: username, exp: Date.now() + SESSION_DURATION_MS }));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string | undefined, secret: string): { username: string } | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      u: string;
      exp: number;
    };
    if (Date.now() > decoded.exp) return null;
    return { username: decoded.u };
  } catch {
    return null;
  }
}
