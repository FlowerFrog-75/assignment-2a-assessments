import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Encrypts small secrets (2FA keys) before they are stored in MongoDB, so a
// copy of the database alone can't be used to generate anyone's codes.
// The key comes from APP_SECRET, which lives only in the server's environment.

let warned = false;

function appSecret(): string {
  const secret = process.env.APP_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_SECRET must be set (at least 32 characters) in production. Generate one with: openssl rand -hex 32");
  }
  if (!warned) {
    console.warn("[security] APP_SECRET is not set; using an insecure development key. Set it in .env.local.");
    warned = true;
  }
  return "development-only-insecure-app-secret-do-not-use";
}

function key(): Buffer {
  return Buffer.from(hkdfSync("sha256", appSecret(), "digital-skills-wallet", "secret-encryption-v1", 32));
}

/** AES-256-GCM. Output: "v1:<iv>:<tag>:<ciphertext>" (base64url). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(":");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, ciphertext] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Unrecognised encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

/** Called at start-up so a missing APP_SECRET fails fast in production. */
export function assertSecretsConfigured(): void {
  appSecret();
}
