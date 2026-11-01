// API server for the Digital Skills Wallet. It connects the React app (src/)
// to MongoDB and the Hyperledger Fabric ledger, which browsers can't reach directly.
//
//   pnpm api        # development: API on http://localhost:4000 (Vite proxies /api to it)
//   pnpm dev:full   # API + Vite together
//   pnpm start      # production: also serves the built app from dist/ (run `pnpm build` first)
import "./scripts/load-env";
import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import { connectToDatabase } from "./db/connect";
import { apiErrorHandler, apiRouter } from "./api/router";
import { startLedgerRetryLoop } from "./assessment/coins";
import { assertSecretsConfigured } from "./security/secrets";

assertSecretsConfigured(); // fail fast in production if APP_SECRET is missing

const port = Number(process.env.API_PORT ?? 4000);
const app = express();
app.disable("x-powered-by");
// Behind a reverse proxy (nginx etc.), set TRUST_PROXY=1 so audit logs record the client's real IP.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

// Security headers. The CSP allows the Google Fonts stylesheet the design uses
// and inline styles (React style props); scripts only from this server.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );
  if (req.secure) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "200kb" }));
app.use("/api", apiRouter, apiErrorHandler);

// Production: serve the built React app from the same server, so one process
// (on your own machine or server) runs the whole thing.
const dist = path.resolve("dist");
if (existsSync(path.join(dist, "index.html"))) {
  app.use(express.static(dist, { index: false }));
  app.get("/{*path}", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}/api`);
  connectToDatabase().then(
    () => console.log("Connected to MongoDB"),
    (error: Error) => console.warn(`MongoDB not reachable yet (${error.message}). The API will answer 503 until it is.`),
  );
  startLedgerRetryLoop();
});
