/**
 * Extrai o ID de arquivo de um link do Google Drive (varios formatos possiveis vindos
 * do formulario) e monta uma URL de visualizacao compativel com a permissao do arquivo
 * (nao forca download, funciona em <img> quando o arquivo esta compartilhado).
 */

const ID_PATTERNS: RegExp[] = [
  /\/file\/d\/([a-zA-Z0-9_-]{10,})/, // .../file/d/ID/view
  /[?&]id=([a-zA-Z0-9_-]{10,})/, // ...open?id=ID  ou  ...uc?id=ID
  /\/d\/([a-zA-Z0-9_-]{10,})/, // .../d/ID
];

export function extractDriveFileId(url: unknown): string | null {
  if (typeof url !== "string" || url.trim() === "") return null;
  for (const pattern of ID_PATTERNS) {
    const match = pattern.exec(url);
    if (match?.[1]) return match[1];
  }
  return null;
}

export interface DrivePhoto {
  fileId: string;
  /** URL para <img>, tamanho grande, sem forcar download. */
  viewUrl: string;
  /** URL para abrir o arquivo original no Google Drive (fallback / "abrir no Drive"). */
  driveUrl: string;
}

export function buildDrivePhoto(rawUrl: unknown): DrivePhoto | null {
  const fileId = extractDriveFileId(rawUrl);
  if (!fileId) return null;
  return {
    fileId,
    viewUrl: `https://lh3.googleusercontent.com/d/${fileId}=w1600`,
    driveUrl: `https://drive.google.com/file/d/${fileId}/view`,
  };
}
