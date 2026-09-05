import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

/**
 * Serve arquivos estaticos de `root`. index.html e sw.js NUNCA sao cacheados (o app
 * shell sempre precisa poder atualizar); os demais arquivos podem ser cacheados pelo
 * navegador normalmente.
 */
export function serveStatic(root: string, req: IncomingMessage, res: ServerResponse, pathname: string): boolean {
  let relative = pathname === "/" ? "/index.html" : pathname;
  relative = normalize(relative).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, relative);
  if (!filePath.startsWith(root)) return false;

  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;

  const ext = extname(filePath);
  const mime = MIME[ext] ?? "application/octet-stream";
  const noCache = relative === "/index.html" || relative === "/sw.js";

  res.writeHead(200, {
    "Content-Type": mime,
    "Content-Length": stat.size,
    "Cache-Control": noCache ? "no-cache, no-store, must-revalidate" : "public, max-age=3600",
  });
  createReadStream(filePath).pipe(res);
  return true;
}
