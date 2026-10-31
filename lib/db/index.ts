// Entry point for app code (Server Components, Route Handlers, Server Actions):
//
//   import { connectToDatabase, UserModel } from "@/lib/db";
//
// "server-only" makes the build fail if this is imported into a Client
// Component, so database code and credentials stay on the server. Client
// Components that only need constants (like skill labels) can import
// "@/lib/db/constants" instead.
import "server-only";

export * from "./connect";
export * from "./constants";
export * from "./models";
