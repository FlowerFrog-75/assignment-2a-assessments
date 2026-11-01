import type { ConnectOptions } from "mongoose";
import mongoose from "./mongoose";

type ConnectionCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

// Keep the connection on globalThis so Next.js dev hot reloads reuse one
// connection pool instead of opening a new one on every file change.
const globalCache = globalThis as typeof globalThis & { _mongooseCache?: ConnectionCache };
const cache = (globalCache._mongooseCache ??= { conn: null, promise: null });

/**
 * Connects to the MongoDB server in MONGODB_URI, or returns the existing
 * connection. Call it at the top of any server code that touches the database:
 *
 *   await connectToDatabase();
 *   const user = await UserModel.findOne({ email });
 *
 * `overrides` only take effect on the first call (when the pool is created).
 */
export async function connectToDatabase(overrides: ConnectOptions = {}): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error(
        "MONGODB_URI is not set. Copy .env.example to .env.local and point it at your MongoDB server (see mongodb/README.md).",
      );
    }

    cache.promise = mongoose
      .connect(uri, {
        appName: "digital-skills-wallet",
        // Fail fast if the server is unreachable instead of queueing queries.
        bufferCommands: false,
        serverSelectionTimeoutMS: 5_000,
        maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE ?? 10),
        // Build indexes automatically in development only. In production,
        // run `pnpm db:indexes` during deployment instead.
        autoIndex: process.env.NODE_ENV !== "production",
        ...overrides,
      })
      .catch((error: unknown) => {
        cache.promise = null; // let the next call retry
        throw error;
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect();
  cache.conn = null;
  cache.promise = null;
}
