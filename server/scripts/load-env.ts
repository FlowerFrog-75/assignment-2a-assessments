import { existsSync } from "node:fs";

// Next.js loads .env files automatically, but standalone scripts don't.
// Same precedence as Next.js: shell environment > .env.local > .env
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
