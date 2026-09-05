import { verifySessionToken } from "./session.js";
import { sendJson } from "../http/router.js";
import { config } from "../config.js";
import type { RequestContext } from "../http/router.js";

export const SESSION_COOKIE = "flash_session";

export function requireAuth(ctx: RequestContext): { username: string } | null {
  const token = ctx.cookies[SESSION_COOKIE];
  const session = verifySessionToken(token, config.sessionSecret);
  if (!session) {
    sendJson(ctx.res, 401, { error: "Sessão expirada ou inválida. Faça login novamente." });
    return null;
  }
  return session;
}
