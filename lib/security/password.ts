import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// scrypt is a memory-hard password hash built into Node.js, so it needs no
// native dependency. Parameters follow the OWASP Password Storage Cheat Sheet.
const PARAMS = { N: 2 ** 17, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const MAX_MEMORY = 256 * 1024 * 1024;

function deriveKey(password: string, salt: Buffer, options: ScryptOptions, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, keyLength, { ...options, maxmem: MAX_MEMORY }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

/** Returns a self-describing hash: "scrypt$N$r$p$<salt>$<hash>" (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, PARAMS, KEY_LENGTH);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/** Constant-time check of a password against a hash from hashPassword(). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64url");
  const actual = await deriveKey(
    password,
    Buffer.from(saltB64, "base64url"),
    { N: Number(n), r: Number(r), p: Number(p) },
    expected.length,
  );
  return timingSafeEqual(actual, expected);
}
