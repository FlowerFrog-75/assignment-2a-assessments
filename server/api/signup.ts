// Self sign-up with join codes, and first-time setup of a new installation.
//
// - A teacher (or admin) turns on a class's join code and gives it to the
//   class. Students sign up with it and land in that class.
// - An admin turns on the school's staff code and gives it to teachers. They
//   sign up with it and must set up two-factor authentication at first sign-in.
// - On a brand-new installation (no administrator yet), the server prints a
//   one-time setup code in its log. Whoever has it can create the school and
//   the first administrator from the sign-in page. Nobody else can.
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { Router, type Request } from "express";
import { Types } from "mongoose";
import { ClassGroupModel, SchoolModel, UserModel, appendAuditLog, currentSchool, type UserDocument } from "../db/models";
import { currentUser, requireAuth, requireRole, startSession } from "../auth/session";
import { rateLimit } from "../auth/rate-limit";
import { hashPassword } from "../security/password";
import { decryptSecret, encryptSecret } from "../security/secrets";
import { checkPasswordStrength, publicUser } from "./auth";
import { ApiError } from "./data";

export const signupRoutes = Router();

// No look-alike characters (I, O, 0, 1): easy to read off a whiteboard.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = (length: number) => Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
/** "k7q2-m9xd " → "K7Q2M9XD" */
export const normalizeCode = (input: unknown) => String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
/** "K7Q2M9XD" → "K7Q2-M9XD" */
export const formatCode = (code: string) => code.match(/.{1,4}/g)?.join("-") ?? code;

const CLASS_CODE_LENGTH = 8; // 40 bits: can't be guessed
const STAFF_CODE_LENGTH = 12; // 60 bits

function sameCode(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** A new wallet ID, e.g. KGSC-2026-JS-4821 (prefix and year from School Settings). */
export async function newWalletId(firstName: string, lastName: string): Promise<string> {
  const school = await currentSchool();
  const prefix = school?.walletPrefix ?? "DSW";
  const year = school?.academicYear ?? new Date().getFullYear();
  const letters = `${firstName[0] ?? "X"}${lastName[0] ?? "X"}`.toUpperCase().replace(/[^A-Z]/g, "X");
  for (let i = 0; i < 20; i++) {
    const id = `${prefix}-${year}-${letters}-${randomInt(1000, 10000)}`;
    if (!(await UserModel.exists({ walletId: id }))) return id;
  }
  return `${prefix}-${year}-${letters}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

// ------------------------------------------------------- first-time setup

let setupCode: string | null = null;

async function adminExists() {
  return (await UserModel.exists({ role: "admin", status: "active" })) !== null;
}

/** Called at start-up: prints a one-time setup code if there is no administrator yet. */
export async function announceSetupCodeIfNeeded() {
  if (await adminExists()) {
    setupCode = null;
    return;
  }
  setupCode ??= makeCode(12);
  console.log("");
  console.log("  ┌──────────────────────────────────────────────────────────┐");
  console.log("  │ New installation: no administrator yet.                  │");
  console.log(`  │ First-time setup code: ${formatCode(setupCode)}                    │`);
  console.log("  │ Open the app in a browser and enter it to set up.        │");
  console.log("  └──────────────────────────────────────────────────────────┘");
  console.log("");
}

function audit(req: Request, user: UserDocument, action: string, label: string, details: Record<string, unknown> = {}) {
  return appendAuditLog({
    actor: user._id,
    actorRole: user.role,
    action,
    resource: { type: "user", id: user._id.toString() },
    subjectStudent: user.role === "student" ? user._id : undefined,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    status: "success",
    details: { label, ...details },
  });
}

function text(value: unknown, field: string, max = 100): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) throw new ApiError(400, "missing_field", `${field} is required`);
  if (trimmed.length > max) throw new ApiError(400, "too_long", `${field} can be at most ${max} characters`);
  return trimmed;
}

function email(value: unknown): string {
  const address = text(value, "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new ApiError(400, "invalid_email", "That email address doesn't look right");
  return address;
}

async function assertEmailFree(address: string) {
  if (await UserModel.exists({ email: address })) {
    throw new ApiError(409, "email_taken", "There's already an account with that email. Sign in instead, or ask your administrator to reset the password.");
  }
}

/** GET /api/signup/status: does this installation still need its first administrator? */
signupRoutes.get("/signup/status", async (_req, res) => {
  const school = await currentSchool();
  res.json({ setupRequired: !(await adminExists()), school: school?.name ?? null });
});

/** POST /api/signup/setup { setupCode, schoolName, firstName, lastName, email, password } */
signupRoutes.post("/signup/setup", rateLimit("setup", 20, 10 * 60_000), async (req, res) => {
  if (await adminExists()) throw new ApiError(409, "already_set_up", "This school has already been set up. Sign in instead.");
  if (!setupCode || !sameCode(normalizeCode(req.body?.setupCode), setupCode)) {
    throw new ApiError(400, "invalid_setup_code", "That setup code isn't right. It's printed in the server's log when the app starts.");
  }
  const schoolName = text(req.body?.schoolName, "School name", 200);
  const address = email(req.body?.email);
  const password = checkPasswordStrength(req.body?.password);
  await assertEmailFree(address);

  const school = (await currentSchool()) ?? new SchoolModel({ academicYear: new Date().getFullYear() });
  school.name = schoolName;
  await school.save();
  const user = await UserModel.create({
    email: address,
    firstName: text(req.body?.firstName, "First name"),
    lastName: text(req.body?.lastName, "Last name"),
    role: "admin",
    passwordHash: await hashPassword(password),
    school: schoolName,
  });
  setupCode = null;
  await startSession(req, res, user, false);
  await audit(req, user, "user.signup", `School set up: ${schoolName} (first administrator)`);
  res.status(201).json({ user: publicUser(user) });
});

// ---------------------------------------------------------- join codes

type CodeMatch =
  | { kind: "student"; classGroup: InstanceType<typeof ClassGroupModel> }
  | { kind: "staff" };

async function findCode(input: unknown): Promise<CodeMatch> {
  const code = normalizeCode(input);
  if (code.length === CLASS_CODE_LENGTH) {
    const classGroup = await ClassGroupModel.findOne({ joinCode: code, joinEnabled: true, archived: false });
    if (classGroup) return { kind: "student", classGroup };
  }
  if (code.length === STAFF_CODE_LENGTH) {
    const school = await SchoolModel.findOne().select("+staffCode");
    if (school?.staffCodeEnabled && school.staffCode && sameCode(code, decryptSecret(school.staffCode))) return { kind: "staff" };
  }
  throw new ApiError(404, "invalid_code", "That code isn't valid. Check it with your teacher or school (it may have been turned off).");
}

/** POST /api/signup/lookup { code }: what the code is for, before the form is filled in. */
signupRoutes.post("/signup/lookup", rateLimit("signup-lookup", 300, 10 * 60_000), async (req, res) => {
  const match = await findCode(req.body?.code);
  const school = await currentSchool();
  if (match.kind === "staff") {
    res.json({ kind: "staff", school: school?.name ?? null });
    return;
  }
  const teachers = await UserModel.find({ _id: { $in: match.classGroup.teachers } }, { firstName: 1, lastName: 1 }).lean();
  res.json({
    kind: "student",
    school: school?.name ?? null,
    className: match.classGroup.name,
    subject: match.classGroup.subject,
    yearLevel: match.classGroup.yearLevel ?? null,
    teachers: teachers.map((t) => `${t.firstName} ${t.lastName}`),
  });
});

/** POST /api/signup { code, firstName, lastName, email, password, yearLevel? } */
signupRoutes.post("/signup", rateLimit("signup", 300, 10 * 60_000), async (req, res) => {
  const match = await findCode(req.body?.code);
  const firstName = text(req.body?.firstName, "First name");
  const lastName = text(req.body?.lastName, "Last name");
  const address = email(req.body?.email);
  const password = checkPasswordStrength(req.body?.password);
  await assertEmailFree(address);
  const school = await currentSchool();

  if (match.kind === "staff") {
    const user = await UserModel.create({ email: address, firstName, lastName, role: "teacher", passwordHash: await hashPassword(password), school: school?.name });
    await startSession(req, res, user, false); // they set up 2FA next (setupRequired)
    await audit(req, user, "user.signup", `Teacher signed up with the staff code: ${firstName} ${lastName}`);
    res.status(201).json({ user: publicUser(user) });
    return;
  }

  const year = Number(req.body?.yearLevel);
  const user = await UserModel.create({
    email: address,
    firstName,
    lastName,
    role: "student",
    passwordHash: await hashPassword(password),
    yearLevel: Number.isInteger(year) && year >= 1 && year <= 12 ? year : match.classGroup.yearLevel ?? undefined,
    walletId: await newWalletId(firstName, lastName),
    school: school?.name,
  });
  await ClassGroupModel.updateOne({ _id: match.classGroup._id }, { $addToSet: { students: user._id } });
  await startSession(req, res, user, false);
  await audit(req, user, "user.signup", `Student signed up and joined ${match.classGroup.name}`);
  res.status(201).json({ user: publicUser(user) });
});

/** POST /api/me/classes/join { code }: a signed-in student joins another class. */
signupRoutes.post("/me/classes/join", requireAuth(), requireRole("student"), rateLimit("join", 60, 10 * 60_000), async (req, res) => {
  const me = currentUser(req);
  const match = await findCode(req.body?.code);
  if (match.kind !== "student") throw new ApiError(400, "not_a_class_code", "That's a staff code, not a class code");
  await ClassGroupModel.updateOne({ _id: match.classGroup._id }, { $addToSet: { students: me._id } });
  await audit(req, me, "class.join", `Joined ${match.classGroup.name} with its class code`);
  res.json({ className: match.classGroup.name });
});

// ------------------------------------------------------ managing codes

/** POST /api/classes/:id/join-code { enabled?, regenerate? }: teachers of the class, or admins. */
signupRoutes.post("/classes/:id/join-code", requireAuth(), requireRole("teacher", "admin"), async (req, res) => {
  const me = currentUser(req);
  const id = String(req.params.id);
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_id", "That class ID isn't valid");
  const classGroup = await ClassGroupModel.findOne({ _id: id, ...(me.role === "admin" ? {} : { teachers: me._id }) });
  if (!classGroup) throw new ApiError(404, "class_not_found", "Class not found (or not one of yours)");
  if (req.body?.regenerate || !classGroup.joinCode) {
    for (let i = 0; i < 5; i++) {
      const code = makeCode(CLASS_CODE_LENGTH);
      if (!(await ClassGroupModel.exists({ joinCode: code }))) {
        classGroup.joinCode = code;
        break;
      }
    }
  }
  if (typeof req.body?.enabled === "boolean") classGroup.joinEnabled = req.body.enabled;
  await classGroup.save();
  await appendAuditLog({
    actor: me._id,
    actorRole: me.role,
    action: "class.join_code",
    resource: { type: "class", id: classGroup._id.toString() },
    ip: req.ip,
    userAgent: req.get("user-agent"),
    status: "success",
    details: { label: `${classGroup.name}: class code ${classGroup.joinEnabled ? "on" : "off"}${req.body?.regenerate ? " (new code)" : ""}` },
  });
  res.json({ joinCode: formatCode(classGroup.joinCode!), joinEnabled: classGroup.joinEnabled });
});

/** Current staff code for School Settings (admins only). */
export async function staffCodeInfo() {
  const school = await SchoolModel.findOne().select("+staffCode");
  return { staffCode: school?.staffCode ? formatCode(decryptSecret(school.staffCode)) : null, staffCodeEnabled: Boolean(school?.staffCodeEnabled) };
}

/** POST /api/admin/school/staff-code { enabled?, regenerate? } */
signupRoutes.post("/admin/school/staff-code", requireAuth(), requireRole("admin"), async (req, res) => {
  const me = currentUser(req);
  const school = await SchoolModel.findOne().select("+staffCode");
  if (!school) throw new ApiError(409, "no_school", "Save the school settings first");
  if (req.body?.regenerate || !school.staffCode) school.staffCode = encryptSecret(makeCode(STAFF_CODE_LENGTH));
  if (typeof req.body?.enabled === "boolean") school.staffCodeEnabled = req.body.enabled;
  await school.save();
  await appendAuditLog({
    actor: me._id,
    actorRole: "admin",
    action: "school.staff_code",
    ip: req.ip,
    userAgent: req.get("user-agent"),
    status: "success",
    details: { label: `Staff sign-up code ${school.staffCodeEnabled ? "on" : "off"}${req.body?.regenerate ? " (new code)" : ""}` },
  });
  res.json(await staffCodeInfo());
});
