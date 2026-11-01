import type { RequestHandler } from "express";
import { ApiError } from "../api/data";

/**
 * Simple in-memory limiter: at most `max` requests per `windowMs` from one IP
 * address. Fine for a single server. Behind a load balancer you'd use a shared store.
 */
export function rateLimit(name: string, max: number, windowMs: number): RequestHandler {
  const hits = new Map<string, number[]>();
  return (req, _res, next) => {
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      return next(new ApiError(429, "too_many_requests", "Too many attempts. Please wait a few minutes and try again."));
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) hits.clear(); // keep memory bounded
    next();
  };
}
