import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Hash de senha com scrypt (nativo do node:crypto, sem depender de bcrypt/argon2).
 * Formato armazenado: "scrypt$<salt-hex>$<hash-hex>".
 */

const KEY_LEN = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1]!, "hex");
  const expected = Buffer.from(parts[2]!, "hex");
  const actual = scryptSync(plain, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
