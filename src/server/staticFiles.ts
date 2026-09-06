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
 * shell sempre precisa poder atualizar).
 *
 * Os demais arquivos (JS/CSS/etc.) usam um ETag baseado em tamanho+data de modificacao
 * em vez de um "public, max-age" cego: o navegador sempre revalida com o servidor a cada
 * carregamento (uma requisicao condicional barata, que so baixa o arquivo de novo se ele
 * de fato mudou). Sem isso, depois de cada deploy o navegador podia continuar rodando o
 * JS ANTIGO por ate 1 hora (o tempo do max-age anterior) mesmo com a pagina recarregada,
 * porque o index.html (sempre fresco) ainda apontava pros mesmos nomes de arquivo de
 * sempre — so o CONTEUDO mudava, e o navegador nao tinha motivo pra ir buscar de novo.
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

  if (noCache) {
    res.writeHead(200, {
      "Content-Type": mime,
      "Content-Length": stat.size,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    });
    createReadStream(filePath).pipe(res);
    return true;
  }

  const etag = `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  const ifNoneMatch = req.headers["if-none-match"];
  if (ifNoneMatch === etag) {
    res.writeHead(304, { ETag: etag, "Cache-Control": "no-cache" });
    res.end();
    return true;
  }

  res.writeHead(200, {
    "Content-Type": mime,
    "Content-Length": stat.size,
    "Cache-Control": "no-cache",
    ETag: etag,
    "Last-Modified": stat.mtime.toUTCString(),
  });
  createReadStream(filePath).pipe(res);
  return true;
}
