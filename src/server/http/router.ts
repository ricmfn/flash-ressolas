import type { IncomingMessage, ServerResponse } from "node:http";
import { gzipSync } from "node:zlib";

export interface RequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  cookies: Record<string, string>;
}

export type Handler = (ctx: RequestContext) => Promise<void> | void;

interface Route {
  method: string;
  segments: string[]; // ex: ["api","orders",":row","status"]
  handler: Handler;
}

/** Router HTTP minimo, sem dependencias externas (sem Express). */
export class Router {
  private routes: Route[] = [];

  add(method: string, path: string, handler: Handler): void {
    this.routes.push({ method, segments: path.split("/").filter(Boolean), handler });
  }

  get(path: string, handler: Handler) {
    this.add("GET", path, handler);
  }
  post(path: string, handler: Handler) {
    this.add("POST", path, handler);
  }

  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | null {
    const segments = pathname.split("/").filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== segments.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i++) {
        const routeSeg = route.segments[i]!;
        const actual = segments[i]!;
        if (routeSeg.startsWith(":")) {
          params[routeSeg.slice(1)] = decodeURIComponent(actual);
        } else if (routeSeg !== actual) {
          ok = false;
          break;
        }
      }
      if (ok) return { handler: route.handler, params };
    }
    return null;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export async function readJsonBody<T>(req: IncomingMessage, maxBytes = 1_000_000): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error("Corpo da requisição muito grande.");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {} as T;
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") return {} as T;
  return JSON.parse(text) as T;
}

/** Nao vale a pena comprimir respostas minusculas (o overhead do cabecalho gzip supera o ganho). */
const GZIP_MIN_BYTES = 512;

function acceptsGzip(req: IncomingMessage): boolean {
  const header = req.headers["accept-encoding"];
  if (!header) return false;
  return header.split(",").some((enc) => enc.trim().split(";")[0] === "gzip");
}

/**
 * Aceita tanto `{req, res}` (qualquer RequestContext serve) quanto so `res` sozinho (usado
 * nos poucos pontos do entrypoint HTTP que ainda nao tem um RequestContext montado, ex:
 * rota nao encontrada antes do match, ou o catch-all de erro). Sem `req` disponivel, nao da
 * pra checar Accept-Encoding do cliente — a resposta sai sem compressao nesses casos raros.
 */
export function sendJson(
  target: { req: IncomingMessage; res: ServerResponse } | ServerResponse,
  status: number,
  body: unknown,
): void {
  const res = "res" in target ? target.res : target;
  const req = "req" in target ? target.req : undefined;
  const buf = Buffer.from(JSON.stringify(body), "utf8");

  if (req && buf.length >= GZIP_MIN_BYTES && acceptsGzip(req)) {
    const compressed = gzipSync(buf);
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Encoding": "gzip",
      Vary: "Accept-Encoding",
      "Content-Length": compressed.length,
    });
    res.end(compressed);
    return;
  }

  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": buf.length,
  });
  res.end(buf);
}
