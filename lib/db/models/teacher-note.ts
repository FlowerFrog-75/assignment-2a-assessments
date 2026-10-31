import { Schema, model, type HydratedDocumentFromSchema, type InferSchemaType } from "../mongoose";

/** A teacher's note on a student's progress (Individual Results screen). */
const teacherNoteSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true, maxlength: 2_000 },
  },
  { timestamps: true },
);

teacherNoteSchema.index({ student: 1, createdAt: -1 });

export type TeacherNote = InferSchemaType<typeof teacherNoteSchema>;
export type TeacherNoteDocument = HydratedDocumentFromSchema<typeof teacherNoteSchema>;
export const TeacherNoteModel = model("TeacherNote", teacherNoteSchema);
