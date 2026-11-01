// Sign-in, sign-out, password change and 2FA (required for teachers and admins).
import { Router, type Request } from "express";
import QRCode from "qrcode";
import { UserModel, appendAuditLog, currentSchool, type UserDocument } from "../db/models";
import { rateLimit } from "../auth/rate-limit";
import { currentUser, endAllSessions, endSession, requireAuth, setupRequired, startSession } from "../auth/session";
import { hashPassword, verifyPassword } from "../security/password";
import { decryptSecret, encryptSecret } from "../security/secrets";
import { generateTotpSecret, totpUri, verifyTotp } from "../security/totp";
import { ApiError } from "./data";

export const authRoutes = Router();

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const MIN_PASSWORD_LENGTH = 10;

/** What the browser is told about the signed-in user. */
export function publicUser(user: UserDocument) {
  return {
    id: user._id.toString(),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    walletId: user.walletId ?? null,
    yearLevel: user.yearLevel ?? null,
    twoFactorEnabled: Boolean(user.twoFactor?.enabled),
    twoFactorRequired: user.role !== "student",
    mustChangePassword: Boolean(user.mustChangePassword),
    setupRequired: setupRequired(user),
  };
}

function audit(req: Request, user: UserDocument | null, action: string, status: "success" | "failure" | "warning", details: Record<string, unknown> = {}) {
  return appendAuditLog({
    actor: user?._id ?? null,
    actorRole: user ? user.role : "anonymous",
    action,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    status,
    details: { label: "Auth system", ...details },
  });
}

export function checkPasswordStrength(password: unknown): string {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new ApiError(400, "weak_password", `Passwords must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (password.length > 200) throw new ApiError(400, "weak_password", "Passwords can be at most 200 characters");
  return password;
}

// A real hash to compare against when the email doesn't exist, so response
// times don't reveal which emails have accounts.
const dummyHash = hashPassword("not-a-real-password-just-for-timing");

/** POST /api/auth/login { email, password } */
const loginEmail = (req: Request) => String(req.body?.email ?? "").trim().toLowerCase();

authRoutes.post(
  "/auth/login",
  rateLimit("login-ip", 600, 10 * 60_000), // a whole school can share one IP address
  rateLimit("login-account", 15, 10 * 60_000, loginEmail),
  async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const user = email ? await UserModel.findOne({ email }).select("+passwordHash") : null;

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    await audit(req, user, "auth.login", "failure", { reason: "account locked" });
    throw new ApiError(429, "account_locked", `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }

  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
  if (!user || !ok) {
    if (user) {
      const failed = (user.failedLogins ?? 0) + 1;
      await UserModel.updateOne(
        { _id: user._id },
        failed >= MAX_FAILED_LOGINS
          ? { $set: { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } }
          : { $set: { failedLogins: failed } },
      );
    }
    await audit(req, user, "auth.login", "failure", { reason: user ? "wrong password" : "unknown email" });
    throw new ApiError(401, "invalid_credentials", "Email or password is incorrect");
  }
  if (user.status !== "active") {
    await audit(req, user, "auth.login", "failure", { reason: "account deactivated" });
    throw new ApiError(403, "account_deactivated", "This account has been deactivated. Contact your school administrator.");
  }

  await UserModel.updateOne({ _id: user._id }, { $set: { failedLogins: 0 }, $unset: { lockedUntil: "" } });
  const needsCode = Boolean(user.twoFactor?.enabled);
  await startSession(req, res, user, needsCode);
  if (!needsCode) {
    await UserModel.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
    await audit(req, user, "auth.login", "success");
  }
  res.json({ twoFactorRequired: needsCode, user: needsCode ? null : publicUser(user) });
  },
);

/** POST /api/auth/2fa/verify { code }: second step of sign-in. */
authRoutes.post("/auth/2fa/verify", rateLimit("2fa", 600, 10 * 60_000), async (req, res) => {
  const auth = req.auth;
  if (!auth?.session.pendingTwoFactor) throw new ApiError(400, "no_pending_login", "Sign in with your password first");
  const user = await UserModel.findById(auth.user._id).select("+twoFactor.secret +twoFactor.lastUsedStep");
  if (!user?.twoFactor?.secret) throw new ApiError(400, "two_factor_not_set_up", "2FA isn't set up for this account");

  const step = verifyTotp(decryptSecret(user.twoFactor.secret), String(req.body?.code ?? "").trim());
  if (step === null || step <= (user.twoFactor.lastUsedStep ?? -1)) {
    const failed = (user.failedLogins ?? 0) + 1;
    if (failed >= MAX_FAILED_LOGINS) {
      await UserModel.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } });
      await endSession(req, res);
    } else {
      await UserModel.updateOne({ _id: user._id }, { $set: { failedLogins: failed } });
    }
    await audit(req, user, "auth.2fa", "failure");
    throw new ApiError(401, "invalid_code", "That code isn't right. Check your authenticator app and try again.");
  }

  await UserModel.updateOne(
    { _id: user._id },
    { $set: { "twoFactor.lastUsedStep": step, failedLogins: 0, lastLoginAt: new Date() } },
  );
  await startSession(req, res, user, false); // new token after the second factor
  await audit(req, user, "auth.login", "success", { method: "password + 2FA" });
  res.json({ user: publicUser(user) });
});

/** POST /api/auth/logout */
authRoutes.post("/auth/logout", async (req, res) => {
  if (req.auth) await audit(req, req.auth.user, "auth.logout", "success");
  await endSession(req, res);
  res.json({ ok: true });
});

/** GET /api/auth/me: who is signed in (401 if nobody). */
authRoutes.get("/auth/me", requireAuth({ allowSetup: true }), async (req, res) => {
  const school = await currentSchool();
  res.json({ user: publicUser(currentUser(req)), school: school ? { name: school.name, shortName: school.shortName ?? null } : null });
});

/** POST /api/auth/password { currentPassword, newPassword } */
authRoutes.post("/auth/password", requireAuth({ allowSetup: true }), async (req, res) => {
  const user = await UserModel.findById(currentUser(req)._id).select("+passwordHash");
  if (!user) throw new ApiError(401, "unauthenticated", "Please sign in");
  const next = checkPasswordStrength(req.body?.newPassword);
  if (!(await verifyPassword(String(req.body?.currentPassword ?? ""), user.passwordHash))) {
    throw new ApiError(400, "wrong_password", "Your current password isn't right");
  }
  if (await verifyPassword(next, user.passwordHash)) {
    throw new ApiError(400, "same_password", "Choose a different password from your current one");
  }
  user.passwordHash = await hashPassword(next);
  user.mustChangePassword = false;
  await user.save();
  await endAllSessions(user._id, req.auth!.session._id); // sign out other devices
  await audit(req, user, "auth.password.change", "success");
  res.json({ user: publicUser(user) });
});

/** POST /api/auth/2fa/setup: new secret + QR code to scan. */
authRoutes.post("/auth/2fa/setup", requireAuth({ allowSetup: true }), async (req, res) => {
  const user = currentUser(req);
  if (user.twoFactor?.enabled) throw new ApiError(409, "already_enabled", "2FA is already on. An administrator can reset it.");
  const secret = generateTotpSecret();
  await UserModel.updateOne({ _id: user._id }, { $set: { "twoFactor.pendingSecret": encryptSecret(secret) } });
  const school = await currentSchool();
  const uri = totpUri(secret, user.email, school?.shortName || school?.name || "Digital Skills Wallet");
  res.json({ secret, uri, qrCode: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) });
});

/** POST /api/auth/2fa/enable { code }: confirms the new secret. */
authRoutes.post("/auth/2fa/enable", requireAuth({ allowSetup: true }), rateLimit("2fa-enable", 600, 10 * 60_000), async (req, res) => {
  const user = await UserModel.findById(currentUser(req)._id).select("+twoFactor.pendingSecret");
  if (!user?.twoFactor?.pendingSecret) throw new ApiError(400, "no_pending_setup", "Start 2FA setup first");
  const pending = decryptSecret(user.twoFactor.pendingSecret);
  const step = verifyTotp(pending, String(req.body?.code ?? "").trim());
  if (step === null) throw new ApiError(400, "invalid_code", "That code isn't right. Check the time on your phone and try again.");
  await UserModel.updateOne(
    { _id: user._id },
    {
      $set: { "twoFactor.enabled": true, "twoFactor.secret": encryptSecret(pending), "twoFactor.lastUsedStep": step, "twoFactor.enrolledAt": new Date() },
      $unset: { "twoFactor.pendingSecret": "" },
    },
  );
  await audit(req, user, "auth.2fa.enable", "success");
  res.json({ user: publicUser((await UserModel.findById(user._id))!) });
});
