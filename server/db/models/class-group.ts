import { Schema, model, type HydratedDocumentFromSchema, type InferSchemaType } from "../mongoose";

/** A teaching group, e.g. "Year 11 Science, Ms Chen, Term 4 2026". */
const classGroupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    subject: { type: String, required: true, trim: true, maxlength: 80 },
    school: { type: String, trim: true, maxlength: 200 },
    yearLevel: { type: Number, min: 1, max: 12 },
    academicYear: { type: Number, required: true, min: 2000, max: 2100 },
    term: { type: Number, min: 1, max: 4 },
    teachers: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      validate: [(v: unknown[]) => v.length > 0, "A class needs at least one teacher"],
    },
    students: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "classes" },
);

classGroupSchema.index({ teachers: 1, archived: 1 });
classGroupSchema.index({ students: 1, archived: 1 });

export type ClassGroup = InferSchemaType<typeof classGroupSchema>;
export type ClassGroupDocument = HydratedDocumentFromSchema<typeof classGroupSchema>;
export const ClassGroupModel = model("ClassGroup", classGroupSchema);
