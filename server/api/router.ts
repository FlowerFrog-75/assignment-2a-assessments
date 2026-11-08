import { Router, type ErrorRequestHandler, type RequestHandler } from "express";
import { connectToDatabase } from "../db/connect";
import { loadSession } from "../auth/session";
import { adminRoutes } from "./admin";
import { aiRoutes } from "./ai";
import { assessmentRoutes } from "./assessments";
import { authRoutes } from "./auth";
import { signupRoutes } from "./signup";
import { ApiError } from "./data";
import { ledgerRoutes } from "./ledger";
import { healthRoutes, publicRoutes } from "./public";
import { studentRoutes } from "./students";
import { teacherRoutes } from "./teacher";
import { teachingRoutes } from "./teaching";

/** Everything under /api. Responses are always JSON, errors included. */
export const apiRouter = Router();

// Health reports on the database itself, so it runs before the check below.
apiRouter.use(healthRoutes);

// Every other route needs MongoDB. Answer 503 straight away if it's down.
apiRouter.use(async (_req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    console.error("[api] MongoDB unavailable:", (error as Error).message);
    res.status(503).json({ error: "database_unavailable", message: "The database is not reachable" });
  }
});

// Cross-site request forgery: browsers won't let another website add a custom
// header to a request without a CORS preflight (which this server never
// approves), so requiring one on every change blocks forged form posts.
const requireAppHeader: RequestHandler = (req, _res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  if (req.get("x-requested-with") !== "dsw") return next(new ApiError(403, "csrf", "Request blocked. Reload the page and try again."));
  next();
};
apiRouter.use(requireAppHeader);
apiRouter.use(loadSession);

apiRouter.use(authRoutes);
apiRouter.use(signupRoutes);
apiRouter.use(publicRoutes);
apiRouter.use(studentRoutes);
apiRouter.use(teacherRoutes);
apiRouter.use(teachingRoutes);
apiRouter.use(aiRoutes);
apiRouter.use(assessmentRoutes);
apiRouter.use(adminRoutes);
apiRouter.use(ledgerRoutes);

apiRouter.use((_req, res) => {
  res.status(404).json({ error: "not_found", message: "No such API route" });
});

export const apiErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: error.code, message: error.message });
    return;
  }
  // Mongoose validation and bad IDs are the caller's mistake, not ours.
  if (error?.name === "ValidationError") {
    const first = Object.values(error.errors ?? {})[0] as { message?: string } | undefined;
    res.status(400).json({ error: "invalid", message: first?.message ?? "Some details aren't valid" });
    return;
  }
  if (error?.name === "CastError") {
    res.status(400).json({ error: "invalid_id", message: "That ID isn't valid" });
    return;
  }
  if (error?.code === 11000) {
    const field = Object.keys(error.keyValue ?? {})[0] ?? "value";
    res.status(409).json({ error: "duplicate", message: `That ${field} is already in use` });
    return;
  }
  if (error?.type === "entity.parse.failed") {
    res.status(400).json({ error: "bad_json", message: "The request body isn't valid JSON" });
    return;
  }
  console.error("[api]", error);
  res.status(500).json({ error: "server_error", message: "Something went wrong" });
};
