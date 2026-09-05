import { createSign } from "node:crypto";
import type { ServiceAccountKey } from "../config.js";

/**
 * Fluxo OAuth2 de Service Account do Google, implementado so com node:crypto/fetch
 * (sem depender do pacote "google-auth-library", indisponivel neste ambiente).
 * https://developers.google.com/identity/protocols/oauth2/service-account
 */

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signJwt(account: ServiceAccountKey, scope: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: account.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(account.private_key);
  return `${unsigned}.${base64url(signature)}`;
}

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

let cached: CachedToken | null = null;

/** Retorna um access token valido, reaproveitando o cache enquanto nao expirar. */
export async function getAccessToken(
  account: ServiceAccountKey,
  scope = "https://www.googleapis.com/auth/spreadsheets",
): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAtMs - now > 60_000) {
    return cached.accessToken;
  }

  const assertion = signJwt(account, scope);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Falha ao obter access token do Google (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { accessToken: json.access_token, expiresAtMs: now + json.expires_in * 1000 };
  return cached.accessToken;
}
