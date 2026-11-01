// Administrators: school settings, user accounts, classes, and oversight of
// skill coins and the blockchain.
import { randomBytes, randomInt } from "node:crypto";
import { Router, type Request } from "express";
import { Types } from "mongoose";
import { USER_ROLES, skillLabel, type SkillKey, type UserRole } from "../db/constants";
import {
  AssessmentAttemptModel,
  AssessmentItemModel,
  AssessmentTemplateModel,
  ClassGroupModel,
  SchoolModel,
  UserModel,
  WalletEventModel,
  appendAuditLog,
  currentSchool,
  verifyAuditChain,
  type UserDocument,
} from "../db/models";
import { currentUser, endAllSessions, requireAuth, requireRole } from "../auth/session";
import { hashPassword } from "../security/password";
import { syncLedgerSoon } from "../assessment/coins";
import { ApiError } from "./data";
import { formatDate, formatTimestamp } from "./format";

export const adminRoutes = Router();
const admin = [requireAuth(), requireRole("admin")];

function objectId(value: unknown, what = "ID"): Types.ObjectId {
  if (typeof value !== "string" || !Types.ObjectId.isValid(value)) throw new ApiError(400, "invalid_id", `That ${what} isn't valid`);
  return new Types.ObjectId(value);
}

function text(value: unknown, field: string, { required = false, max = 200 } = {}): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ApiError(400, "missing_field", `${field} is required`);
    return undefined;
  }
  if (typeof value !== "string") throw new ApiError(400, "invalid_field", `${field} must be text`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new ApiError(400, "missing_field", `${field} is required`);
  if (trimmed.length > max) throw new ApiError(400, "too_long", `${field} can be at most ${max} characters`);
  return trimmed || undefined;
}

function optionalInt(value: unknown, field: string, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new ApiError(400, "invalid_field", `${field} must be a whole number from ${min} to ${max}`);
  return n;
}

function audit(req: Request, me: UserDocument, action: string, label: string, extra: { subjectStudent?: Types.ObjectId; resource?: { type: string; id?: string }; details?: Record<string, unknown> } = {}) {
  return appendAuditLog({
    actor: me._id,
    actorRole: "admin",
    action,
    resource: extra.resource,
    subjectStudent: extra.subjectStudent,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    status: "success",
    details: { label, ...extra.details },
  });
}

/** A readable temporary password, e.g. "plum-river-4821-kite". Shown to the admin once. */
const WORDS = "amber,anchor,apple,arrow,aspen,birch,breeze,brook,cedar,cliff,cloud,comet,coral,crane,delta,dune,ember,fern,field,flint,frost,grove,harbor,hazel,heron,island,ivory,jade,kite,lake,larch,lemon,lilac,maple,meadow,mesa,mint,moss,north,oak,ocean,olive,orbit,pearl,pine,plum,prairie,quartz,raven,reef,ridge,river,robin,sage,shore,slate,spruce,stone,summit,swift,thistle,tide,timber,valley,violet,willow,wren".split(",");
function temporaryPassword(): string {
  const word = () => WORDS[randomInt(WORDS.length)];
  return `${word()}-${word()}-${randomInt(1000, 10000)}-${word()}`;
}

async function newWalletId(firstName: string, lastName: string): Promise<string> {
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

function userRow(u: UserDocument | (Record<string, any> & { _id: Types.ObjectId })) {
  return {
    id: u._id.toString(),
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    status: u.status,
    yearLevel: u.yearLevel ?? null,
    walletId: u.walletId ?? null,
    twoFactorEnabled: Boolean(u.twoFactor?.enabled),
    mustChangePassword: Boolean(u.mustChangePassword),
    locked: Boolean(u.lockedUntil && u.lockedUntil > new Date()),
    lastLogin: u.lastLoginAt ? formatTimestamp(u.lastLoginAt) : null,
    created: formatDate(u.createdAt),
  };
}

// --------------------------------------------------------------- overview

/** GET /api/admin/overview: counts and anything that needs attention. */
adminRoutes.get("/admin/overview", ...admin, async (_req, res) => {
  const [school, roles, classes, templates, pendingItems, toMark, toRelease, ledger, chain] = await Promise.all([
    currentSchool(),
    UserModel.aggregate<{ _id: string; n: number }>([{ $match: { status: "active" } }, { $group: { _id: "$role", n: { $sum: 1 } } }]),
    ClassGroupModel.countDocuments({ archived: false }),
    AssessmentTemplateModel.countDocuments({ status: "published" }),
    AssessmentItemModel.countDocuments({ status: "pending_review" }),
    AssessmentAttemptModel.countDocuments({ status: "submitted" }),
    AssessmentAttemptModel.countDocuments({ status: "marked" }),
    WalletEventModel.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$ledger.status", n: { $sum: 1 } } }]),
    verifyAuditChain(),
  ]);
  const count = (list: { _id: string; n: number }[], key: string) => list.find((r) => r._id === key)?.n ?? 0;
  res.json({
    school: school ? { name: school.name, configured: true } : { name: null, configured: false },
    users: { students: count(roles, "student"), teachers: count(roles, "teacher"), admins: count(roles, "admin") },
    classes,
    publishedTemplates: templates,
    pendingItems,
    marking: { toMark, toRelease },
    ledger: { committed: count(ledger, "committed"), pending: count(ledger, "pending"), failed: count(ledger, "failed") },
    auditChain: chain.ok ? { ok: true, checked: chain.checked } : { ok: false, checked: chain.checked, brokenAt: chain.brokenAt },
  });
});

// ----------------------------------------------------------------- school

adminRoutes.get("/admin/school", ...admin, async (_req, res) => {
  const school = await currentSchool();
  res.json({
    school: school
      ? {
          name: school.name,
          shortName: school.shortName ?? "",
          address: school.address ?? "",
          contactEmail: school.contactEmail ?? "",
          timezone: school.timezone ?? "Australia/Brisbane",
          academicYear: school.academicYear ?? new Date().getFullYear(),
          term: school.term ?? 1,
          walletPrefix: school.walletPrefix ?? "DSW",
        }
      : null,
  });
});

adminRoutes.put("/admin/school", ...admin, async (req, res) => {
  const me = currentUser(req);
  const body = req.body ?? {};
  const fields = {
    name: text(body.name, "School name", { required: true, max: 200 }),
    shortName: text(body.shortName, "Short name", { max: 40 }),
    address: text(body.address, "Address", { max: 300 }),
    contactEmail: text(body.contactEmail, "Contact email", { max: 254 }),
    timezone: text(body.timezone, "Time zone", { max: 60 }) ?? "Australia/Brisbane",
    academicYear: optionalInt(body.academicYear, "Academic year", 2000, 2100),
    term: optionalInt(body.term, "Term", 1, 4),
    walletPrefix: (text(body.walletPrefix, "Wallet prefix", { max: 6 }) ?? "DSW").toUpperCase(),
  };
  if (!/^[A-Z]{2,6}$/.test(fields.walletPrefix)) throw new ApiError(400, "invalid_field", "Wallet prefix must be 2 to 6 letters");
  if (fields.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.contactEmail)) throw new ApiError(400, "invalid_field", "Contact email isn't valid");
  try {
    Intl.DateTimeFormat("en-AU", { timeZone: fields.timezone });
  } catch {
    throw new ApiError(400, "invalid_field", "Unknown time zone (use a name like Australia/Brisbane)");
  }
  const school = (await currentSchool()) ?? new SchoolModel();
  school.set(fields);
  await school.save();
  await audit(req, me, "school.update", `School settings saved (${school.name})`);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ users

/** GET /api/admin/users?role=&status=&q= */
adminRoutes.get("/admin/users", ...admin, async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (USER_ROLES.includes(req.query.role as UserRole)) filter.role = req.query.role;
  if (req.query.status === "active" || req.query.status === "deactivated") filter.status = req.query.status;
  if (typeof req.query.q === "string" && req.query.q.trim()) {
    const re = { $regex: req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = [{ firstName: re }, { lastName: re }, { email: re }, { walletId: re }];
  }
  const users = await UserModel.find(filter).sort({ role: 1, lastName: 1, firstName: 1 }).limit(2000).lean();
  res.json({ users: users.map(userRow) });
});

/** POST /api/admin/users { email, firstName, lastName, role, yearLevel? } → temporary password (shown once). */
adminRoutes.post("/admin/users", ...admin, async (req, res) => {
  const me = currentUser(req);
  const body = req.body ?? {};
  const role = body.role as UserRole;
  if (!USER_ROLES.includes(role)) throw new ApiError(400, "invalid_role", "Choose student, teacher or admin");
  const firstName = text(body.firstName, "First name", { required: true, max: 100 })!;
  const lastName = text(body.lastName, "Last name", { required: true, max: 100 })!;
  const email = text(body.email, "Email", { required: true, max: 254 })!.toLowerCase();
  const password = temporaryPassword();
  const user = await UserModel.create({
    email,
    firstName,
    lastName,
    role,
    passwordHash: await hashPassword(password),
    mustChangePassword: true,
    yearLevel: role === "student" ? optionalInt(body.yearLevel, "Year level", 1, 12) : undefined,
    walletId: role === "student" ? await newWalletId(firstName, lastName) : undefined,
    school: (await currentSchool())?.name,
  });
  await audit(req, me, "user.create", `Account created: ${firstName} ${lastName} (${role})`, {
    resource: { type: "user", id: user._id.toString() },
    subjectStudent: role === "student" ? user._id : undefined,
  });
  res.status(201).json({ user: userRow(user), temporaryPassword: password });
});

/** Stops an admin locking everyone (including themselves) out. */
async function assertAnotherAdmin(user: UserDocument) {
  if (user.role !== "admin") return;
  const others = await UserModel.countDocuments({ role: "admin", status: "active", _id: { $ne: user._id } });
  if (others === 0) throw new ApiError(409, "last_admin", "This is the only active administrator. Create another admin first.");
}

/** PATCH /api/admin/users/:id { firstName, lastName, email, role, yearLevel, status } */
adminRoutes.patch("/admin/users/:id", ...admin, async (req, res) => {
  const me = currentUser(req);
  const user = await UserModel.findById(objectId(req.params.id, "user"));
  if (!user) throw new ApiError(404, "user_not_found", "User not found");
  const body = req.body ?? {};
  const changes: string[] = [];

  if (body.firstName !== undefined) user.firstName = text(body.firstName, "First name", { required: true, max: 100 })!;
  if (body.lastName !== undefined) user.lastName = text(body.lastName, "Last name", { required: true, max: 100 })!;
  if (body.email !== undefined) user.email = text(body.email, "Email", { required: true, max: 254 })!.toLowerCase();
  if (body.yearLevel !== undefined && user.role === "student") user.yearLevel = optionalInt(body.yearLevel, "Year level", 1, 12);
  if (body.role !== undefined && body.role !== user.role) {
    if (!USER_ROLES.includes(body.role)) throw new ApiError(400, "invalid_role", "Choose student, teacher or admin");
    if (user.role === "student" || body.role === "student") {
      throw new ApiError(409, "role_change", "Students can't become staff (or the reverse), because wallets belong to students. Create a separate account instead.");
    }
    await assertAnotherAdmin(user);
    changes.push(`role ${user.role} → ${body.role}`);
    user.role = body.role;
  }
  if (body.status !== undefined && body.status !== user.status) {
    if (body.status !== "active" && body.status !== "deactivated") throw new ApiError(400, "invalid_status", "Unknown status");
    if (body.status === "deactivated") {
      if (user._id.equals(me._id)) throw new ApiError(409, "self", "You can't deactivate your own account");
      await assertAnotherAdmin(user);
    }
    changes.push(body.status === "deactivated" ? "deactivated" : "reactivated");
    user.status = body.status;
  }
  await user.save();
  if (user.status === "deactivated" || changes.some((c) => c.startsWith("role"))) await endAllSessions(user._id);
  await audit(req, me, "user.update", `Account updated: ${user.firstName} ${user.lastName}${changes.length ? ` (${changes.join(", ")})` : ""}`, {
    resource: { type: "user", id: user._id.toString() },
    subjectStudent: user.role === "student" ? user._id : undefined,
  });
  res.json({ user: userRow(user) });
});

/** POST /api/admin/users/:id/reset-password → new temporary password (shown once). */
adminRoutes.post("/admin/users/:id/reset-password", ...admin, async (req, res) => {
  const me = currentUser(req);
  const user = await UserModel.findById(objectId(req.params.id, "user"));
  if (!user) throw new ApiError(404, "user_not_found", "User not found");
  const password = temporaryPassword();
  await UserModel.updateOne(
    { _id: user._id },
    { $set: { passwordHash: await hashPassword(password), mustChangePassword: true, failedLogins: 0 }, $unset: { lockedUntil: "" } },
  );
  await endAllSessions(user._id);
  await audit(req, me, "user.password.reset", `Password reset: ${user.firstName} ${user.lastName}`, { resource: { type: "user", id: user._id.toString() } });
  res.json({ temporaryPassword: password });
});

/** POST /api/admin/users/:id/reset-2fa: for a lost phone. They set 2FA up again at next sign-in. */
adminRoutes.post("/admin/users/:id/reset-2fa", ...admin, async (req, res) => {
  const me = currentUser(req);
  const user = await UserModel.findById(objectId(req.params.id, "user"));
  if (!user) throw new ApiError(404, "user_not_found", "User not found");
  await UserModel.updateOne(
    { _id: user._id },
    { $set: { "twoFactor.enabled": false }, $unset: { "twoFactor.secret": "", "twoFactor.pendingSecret": "", "twoFactor.lastUsedStep": "", "twoFactor.enrolledAt": "" } },
  );
  await endAllSessions(user._id);
  await audit(req, me, "user.2fa.reset", `2FA reset: ${user.firstName} ${user.lastName}`, { resource: { type: "user", id: user._id.toString() } });
  res.json({ ok: true });
});

/** POST /api/admin/users/:id/unlock: clears a lockout after too many failed sign-ins. */
adminRoutes.post("/admin/users/:id/unlock", ...admin, async (req, res) => {
  const me = currentUser(req);
  const user = await UserModel.findByIdAndUpdate(objectId(req.params.id, "user"), { $set: { failedLogins: 0 }, $unset: { lockedUntil: "" } });
  if (!user) throw new ApiError(404, "user_not_found", "User not found");
  await audit(req, me, "user.unlock", `Account unlocked: ${user.firstName} ${user.lastName}`, { resource: { type: "user", id: user._id.toString() } });
  res.json({ ok: true });
});

/** POST /api/admin/users/:id/sign-out: ends all of a user's sessions. */
adminRoutes.post("/admin/users/:id/sign-out", ...admin, async (req, res) => {
  const me = currentUser(req);
  const user = await UserModel.findById(objectId(req.params.id, "user"));
  if (!user) throw new ApiError(404, "user_not_found", "User not found");
  await endAllSessions(user._id, user._id.equals(me._id) ? req.auth!.session._id : undefined);
  await audit(req, me, "user.sessions.end", `Signed out everywhere: ${user.firstName} ${user.lastName}`, { resource: { type: "user", id: user._id.toString() } });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- classes

adminRoutes.get("/admin/classes", ...admin, async (req, res) => {
  const filter = req.query.archived === "true" ? {} : { archived: false };
  const classes = await ClassGroupModel.find(filter).sort({ academicYear: -1, name: 1 }).lean();
  const people = new Map(
    (await UserModel.find({ _id: { $in: classes.flatMap((c) => [...c.teachers, ...c.students]) } }, { firstName: 1, lastName: 1, walletId: 1, role: 1 }).lean()).map((u) => [u._id.toString(), u]),
  );
  const person = (id: Types.ObjectId) => {
    const u = people.get(id.toString());
    return { id: id.toString(), name: u ? `${u.firstName} ${u.lastName}` : "Removed user", walletId: u?.walletId ?? null };
  };
  res.json({
    classes: classes.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      subject: c.subject,
      yearLevel: c.yearLevel ?? null,
      academicYear: c.academicYear,
      term: c.term ?? null,
      archived: Boolean(c.archived),
      teachers: c.teachers.map(person),
      students: c.students.map(person),
    })),
  });
});

async function classFields(body: Record<string, unknown>) {
  const teacherIds = (Array.isArray(body.teacherIds) ? body.teacherIds : []).map((id: unknown) => objectId(id, "teacher"));
  const studentIds = (Array.isArray(body.studentIds) ? body.studentIds : []).map((id: unknown) => objectId(id, "student"));
  if (teacherIds.length === 0) throw new ApiError(400, "no_teacher", "A class needs at least one teacher");
  const [teachers, students] = await Promise.all([
    UserModel.countDocuments({ _id: { $in: teacherIds }, role: { $in: ["teacher", "admin"] } }),
    UserModel.countDocuments({ _id: { $in: studentIds }, role: "student" }),
  ]);
  if (teachers !== new Set(teacherIds.map(String)).size) throw new ApiError(400, "invalid_teacher", "Every teacher must be a staff account");
  if (students !== new Set(studentIds.map(String)).size) throw new ApiError(400, "invalid_student", "Every student must be a student account");
  const school = await currentSchool();
  return {
    name: text(body.name, "Class name", { required: true, max: 120 })!,
    subject: text(body.subject, "Subject", { required: true, max: 80 })!,
    yearLevel: optionalInt(body.yearLevel, "Year level", 1, 12),
    academicYear: optionalInt(body.academicYear, "Academic year", 2000, 2100) ?? school?.academicYear ?? new Date().getFullYear(),
    term: optionalInt(body.term, "Term", 1, 4),
    teachers: [...new Set(teacherIds.map(String))].map((id) => new Types.ObjectId(id)),
    students: [...new Set(studentIds.map(String))].map((id) => new Types.ObjectId(id)),
    school: school?.name,
  };
}

adminRoutes.post("/admin/classes", ...admin, async (req, res) => {
  const me = currentUser(req);
  const classGroup = await ClassGroupModel.create(await classFields(req.body ?? {}));
  await audit(req, me, "class.create", `Class created: ${classGroup.name}`, { resource: { type: "class", id: classGroup._id.toString() } });
  res.status(201).json({ id: classGroup._id.toString() });
});

adminRoutes.put("/admin/classes/:id", ...admin, async (req, res) => {
  const me = currentUser(req);
  const classGroup = await ClassGroupModel.findById(objectId(req.params.id, "class"));
  if (!classGroup) throw new ApiError(404, "class_not_found", "Class not found");
  classGroup.set({ ...(await classFields(req.body ?? {})), archived: Boolean(req.body?.archived) });
  await classGroup.save();
  await audit(req, me, "class.update", `Class updated: ${classGroup.name}${classGroup.archived ? " (archived)" : ""}`, { resource: { type: "class", id: classGroup._id.toString() } });
  res.json({ ok: true });
});

// ----------------------------------------------------- coins and ledger

/** GET /api/admin/wallet-events?status=&q=: every skill coin issued or revoked. */
adminRoutes.get("/admin/wallet-events", ...admin, async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (["pending", "committed", "failed"].includes(String(req.query.status))) filter["ledger.status"] = req.query.status;
  if (typeof req.query.q === "string" && req.query.q.trim()) {
    const re = { $regex: req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    const students = await UserModel.find({ role: "student", $or: [{ firstName: re }, { lastName: re }, { walletId: re }] }, { _id: 1 }).lean();
    filter.student = { $in: students.map((s) => s._id) };
  }
  const events = await WalletEventModel.find(filter).sort({ createdAt: -1 }).limit(500).lean();
  const revoked = new Set((await WalletEventModel.find({ type: "revoked" }, { revokes: 1 }).lean()).map((e) => String(e.revokes)));
  const people = new Map(
    (await UserModel.find({ _id: { $in: events.flatMap((e) => [e.student, ...(e.actor ? [e.actor] : [])]) } }, { firstName: 1, lastName: 1, walletId: 1 }).lean()).map((u) => [u._id.toString(), u]),
  );
  res.json({
    events: events.map((e) => {
      const s = people.get(e.student.toString());
      const a = e.actor ? people.get(e.actor.toString()) : null;
      return {
        id: e._id.toString(),
        student: s ? `${s.firstName} ${s.lastName}` : "Student",
        walletId: s?.walletId ?? "",
        skill: skillLabel(e.skill as SkillKey),
        type: e.type,
        coins: e.coins,
        reason: e.reason ?? "",
        by: a ? `${a.firstName} ${a.lastName}` : "System",
        date: formatTimestamp(e.createdAt),
        ledgerStatus: e.ledger?.status ?? "pending",
        block: e.ledger?.blockNumber ?? null,
        txId: e.ledger?.txId ?? null,
        error: e.ledger?.error ?? null,
        revoked: revoked.has(e._id.toString()),
      };
    }),
  });
});

/** POST /api/admin/wallet-events/:id/revoke { reason }: reverses an issuance (on MongoDB and the ledger). */
adminRoutes.post("/admin/wallet-events/:id/revoke", ...admin, async (req, res) => {
  const me = currentUser(req);
  const reason = text(req.body?.reason, "Reason", { required: true, max: 500 })!;
  const event = await WalletEventModel.findById(objectId(req.params.id, "event"));
  if (!event || event.type !== "issued") throw new ApiError(404, "event_not_found", "Coin issuance not found");
  try {
    await WalletEventModel.create({ student: event.student, skill: event.skill, type: "revoked", coins: event.coins, reason, revokes: event._id, actor: me._id });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new ApiError(409, "already_revoked", "These coins have already been revoked");
    throw error;
  }
  await audit(req, me, "wallet.coins.revoke", `${event.coins} ${skillLabel(event.skill as SkillKey)} coins revoked: ${reason}`, { subjectStudent: event.student });
  syncLedgerSoon();
  res.json({ ok: true });
});

/** POST /api/admin/ledger/sync: retries everything not yet on the blockchain. */
adminRoutes.post("/admin/ledger/sync", ...admin, async (req, res) => {
  const me = currentUser(req);
  syncLedgerSoon();
  await audit(req, me, "ledger.sync", "Blockchain sync started");
  res.json({ ok: true });
});
