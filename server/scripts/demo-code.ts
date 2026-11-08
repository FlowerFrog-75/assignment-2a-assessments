// Prints the current two-factor codes for the demo staff accounts made by
// `pnpm demo:setup`, so you can present without an authenticator app.
//
//   pnpm demo:code          # once
//   pnpm demo:code --watch  # keeps printing as the codes change
import { existsSync, readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

function b32(s: string) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, v = 0;
  const out: number[] = [];
  for (const c of s) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}

function totp(secret: string) {
  const m = Buffer.alloc(8);
  m.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", b32(secret)).update(m).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

if (!existsSync("demo-accounts.json")) {
  console.error("No demo accounts found. Run `pnpm demo:setup` first.");
  process.exit(1);
}
const accounts = JSON.parse(readFileSync("demo-accounts.json", "utf8")) as Record<string, { email: string; secret: string }>;

function show() {
  const left = 30 - (Math.floor(Date.now() / 1000) % 30);
  const line = Object.entries(accounts)
    .map(([role, a]) => `${role.toUpperCase()} ${totp(a.secret).replace(/(\d{3})/, "$1 ")}`)
    .join("    ");
  console.log(`${line}    (valid ${left}s more)`);
}

show();
if (process.argv.includes("--watch")) {
  setTimeout(() => {
    show();
    setInterval(show, 30_000);
  }, (30 - (Math.floor(Date.now() / 1000) % 30)) * 1000 + 200);
}
