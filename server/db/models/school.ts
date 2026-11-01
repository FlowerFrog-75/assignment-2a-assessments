import { Schema, model, type HydratedDocumentFromSchema, type InferSchemaType } from "../mongoose";

/**
 * The school this installation serves (one per installation). An admin sets
 * it up in the app. Its blockchain identity is the network's SchoolMSP
 * organisation (fabric/config), which is fixed when the network is created.
 */
const schoolSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    shortName: { type: String, trim: true, maxlength: 40 },
    address: { type: String, trim: true, maxlength: 300 },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 254 },
    timezone: { type: String, default: "Australia/Brisbane", maxlength: 60 },
    academicYear: { type: Number, min: 2000, max: 2100 },
    term: { type: Number, min: 1, max: 4 },
    /** Prefix for new wallet IDs, e.g. "DSW" gives DSW-2026-JS-4821. */
    walletPrefix: { type: String, default: "DSW", uppercase: true, trim: true, match: /^[A-Z]{2,6}$/ },
  },
  { timestamps: true, collection: "school" },
);

export type School = InferSchemaType<typeof schoolSchema>;
export type SchoolDocument = HydratedDocumentFromSchema<typeof schoolSchema>;
export const SchoolModel = model("School", schoolSchema);

/** The school record, or null before an admin has set it up. */
export function currentSchool() {
  return SchoolModel.findOne().sort({ createdAt: 1 });
}
