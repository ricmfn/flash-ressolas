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
  /** URL para <img>, tamanho grande (visualizador ampliado / photoViewer.ts), sem forcar
   * download. NAO usar pra miniatura do card — ver thumbUrl. */
  viewUrl: string;
  /**
   * URL pra miniatura do card da lista de Pedidos (exibida a 84-110px CSS). O lh3.googleusercontent.com
   * resiza a imagem NO SERVIDOR do Google conforme o parametro "=wXXX" na propria URL — ou seja,
   * pedir w320 aqui baixa uma imagem de verdade menor (nao só encolhida via CSS depois de baixada
   * inteira em 1600px). 320px cobre confortavelmente ate ~3x de densidade de tela num card de
   * 110px (110*3=330), sem precisar mandar o pedido de foto do cliente inteiro (varios MB de foto
   * de celular, geralmente) só pra mostrar um quadradinho pequeno na lista.
   */
  thumbUrl: string;
  /** URL para abrir o arquivo original no Google Drive (fallback / "abrir no Drive"). */
  driveUrl: string;
}

export function buildDrivePhoto(rawUrl: unknown): DrivePhoto | null {
  const fileId = extractDriveFileId(rawUrl);
  if (!fileId) return null;
  return {
    fileId,
    viewUrl: `https://lh3.googleusercontent.com/d/${fileId}=w1600`,
    thumbUrl: `https://lh3.googleusercontent.com/d/${fileId}=w320`,
    driveUrl: `https://drive.google.com/file/d/${fileId}/view`,
  };
}
