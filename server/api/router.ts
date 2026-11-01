import { Router, type ErrorRequestHandler } from "express";
import { connectToDatabase } from "../db/connect";
import { ApiError } from "./data";
import { ledgerDemoRoutes } from "./ledger-demo";
import { publicRoutes } from "./public";
import { studentRoutes } from "./students";
import { teacherRoutes } from "./teacher";

/** Everything under /api. Responses are always JSON, errors included. */
export const apiRouter = Router();

// Health reports on the database itself, so it runs before the check below.
apiRouter.use(publicRoutes);

// Every other route needs MongoDB. Answer 503 straight away if it's down;
// the screens treat that as "API offline" and show their built-in demo data.
apiRouter.use(async (_req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    console.error("[api] MongoDB unavailable:", (error as Error).message);
    res.status(503).json({ error: "database_unavailable", message: "The database is not reachable" });
  }
});

apiRouter.use(studentRoutes);
apiRouter.use(teacherRoutes);
apiRouter.use(ledgerDemoRoutes);

apiRouter.use((_req, res) => {
  res.status(404).json({ error: "not_found", message: "No such API route" });
});

export const apiErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: error.code, message: error.message });
    return;
  }
  console.error("[api]", error);
  res.status(500).json({ error: "server_error", message: "Something went wrong" });
};
