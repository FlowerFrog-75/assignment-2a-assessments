// Every model file imports Mongoose from here instead of from "mongoose", so
// these global settings are applied before any model is compiled.
import mongoose from "mongoose";

// Next.js dev hot reload re-runs model files. Let model() replace the old
// model instead of throwing OverwriteModelError or keeping a stale schema.
mongoose.set("overwriteModels", true);

export { Schema, model, Types } from "mongoose";
export type { HydratedDocumentFromSchema, InferSchemaType, Query } from "mongoose";
export default mongoose;
