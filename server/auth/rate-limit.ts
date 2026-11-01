import type { Request, RequestHandler } from "express";
import { ApiError } from "../api/data";

/**
 * Simple in-memory limiter: at most `max` requests per `windowMs` per key
 * (by default the client's IP address). Fine for a single server. Behind a
 * load balancer you'd use a shared store.
 *
 * Schools often put every student behind one public IP address, so per-IP
 * limits must be generous. Pass `key` to also limit per account (e.g. by
 * email), which is what stops password guessing, together with lockouts.
 */
export function rateLimit(name: string, max: number, windowMs: number, key: (req: Request) => string = (req) => req.ip ?? "unknown"): RequestHandler {
  const hits = new Map<string, number[]>();
  return (req, _res, next) => {
    const id = `${name}:${key(req)}`;
    const now = Date.now();
    const recent = (hits.get(id) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      return next(new ApiError(429, "too_many_requests", "Too many attempts. Please wait a few minutes and try again."));
    }
    recent.push(now);
    hits.set(id, recent);
    if (hits.size > 50_000) hits.clear(); // keep memory bounded
    next();
  };
}
