/**
 * Declaracoes de ambiente minimas para rodar sem @types/node (indisponivel neste
 * ambiente por falta de acesso ao npm). Cobre exatamente a API do Node/fetch usada
 * pelo projeto. Em producao (onde `npm install` funciona normalmente) isso pode ser
 * substituido por `@types/node` real sem mudar nenhum outro arquivo.
 */

// ---------- Globals ----------

declare class Buffer extends Uint8Array {
  static from(input: string | ArrayLike<number>, encoding?: string): Buffer;
  static concat(list: Buffer[]): Buffer;
  static byteLength(input: string, encoding?: string): number;
  toString(encoding?: string): string;
}

declare const process: {
  env: Record<string, string | undefined>;
  version: string;
};

declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
};

declare function setInterval(handler: () => void, ms: number): NodeJS.Timeout;
declare function clearInterval(handle: NodeJS.Timeout): void;

declare namespace NodeJS {
  interface Timeout {
    unref?: () => void;
  }
}

declare class URL {
  constructor(input: string, base?: string);
  pathname: string;
  searchParams: URLSearchParams;
}

declare class URLSearchParams {
  constructor(init?: string | Record<string, string> | [string, string][]);
  toString(): string;
  get(name: string): string | null;
}

interface HeadersInit {
  [key: string]: string;
}

interface Response {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

declare function fetch(
  input: string,
  init?: {
    method?: string;
    headers?: HeadersInit;
    body?: string | URLSearchParams;
  },
): Promise<Response>;

interface ImportMeta {
  url: string;
}

// ---------- node:crypto ----------
declare module "node:crypto" {
  export function createSign(algorithm: string): {
    update(data: string): void;
    end(): void;
    sign(privateKey: string): Buffer;
  };
  export function createHmac(
    algorithm: string,
    key: string,
  ): {
    update(data: string): { digest(): Buffer };
    digest(): Buffer;
  };
  export function randomBytes(size: number): Buffer;
  export function scryptSync(password: string, salt: Buffer, keylen: number): Buffer;
  export function timingSafeEqual(a: Buffer | Uint8Array, b: Buffer | Uint8Array): boolean;
}

// ---------- node:fs ----------
declare module "node:fs" {
  export function readFileSync(path: string, encoding: string): string;
  export function statSync(path: string): { isFile(): boolean; size: number };
  export function createReadStream(path: string): { pipe(dest: unknown): void };
}

// ---------- node:path ----------
declare module "node:path" {
  export function join(...parts: string[]): string;
  export function dirname(p: string): string;
  export function extname(p: string): string;
  export function normalize(p: string): string;
}

// ---------- node:url ----------
declare module "node:url" {
  export function fileURLToPath(url: string): string;
}

// ---------- node:http ----------
declare module "node:http" {
  export interface IncomingMessage extends AsyncIterable<Buffer> {
    method?: string;
    url?: string;
    headers: Record<string, string | undefined>;
  }
  export interface ServerResponse {
    headersSent: boolean;
    writeHead(status: number, headers?: Record<string, string | number>): void;
    setHeader(name: string, value: string): void;
    end(body?: string): void;
  }
  export interface Server {
    listen(port: number, cb?: () => void): void;
  }
  export function createServer(
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
  ): Server;
}
