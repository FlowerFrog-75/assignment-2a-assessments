import { connection } from "next/server";
import { connectToDatabase } from "@/lib/db";

/**
 * GET /api/health/db: checks that the app can reach MongoDB.
 * Returns 200 when the server answers a ping and 503 when it doesn't. Use it
 * from uptime monitors or after deploying.
 */
export async function GET() {
  await connection(); // always run at request time, never prerender

  const started = performance.now();
  try {
    const mongoose = await connectToDatabase();
    await mongoose.connection.db!.command({ ping: 1 });
    return Response.json({
      status: "ok",
      database: mongoose.connection.name,
      latencyMs: Math.round(performance.now() - started),
    });
  } catch (error) {
    // Log details on the server only. Don't reveal hosts or errors to clients.
    console.error("[health/db] MongoDB check failed:", error);
    return Response.json({ status: "error", message: "Database unavailable" }, { status: 503 });
  }
}
