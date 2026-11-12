import { createHash, randomBytes } from "node:crypto";
import type { Types } from "mongoose";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { UserRole } from "../db/constants";
import { SessionModel, UserModel, type SessionDocument, type UserDocument } from "../db/models";
import { ApiError } from "../api/data";

const COOKIE = "dsw_session";
const SESSION_HOURS = 12;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { session: SessionDocument; user: UserDocument };
    }
  }
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function setCookie(req: Request, res: Response, token: string, maxAgeSeconds: number) {
  const secure = req.secure || process.env.NODE_ENV === "production";
  res.append(
    "Set-Cookie",
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`,
  );
}

/**
 * Sample-school accounts (simple passwords, no 2FA) only work while sample
 * mode is on: by default in development, and in production only with
 * SAMPLE_SCHOOL=on. A forgotten sample account can't be used on a real server.
 */
export function sampleModeEnabled(): boolean {
  const setting = process.env.SAMPLE_SCHOOL;
  if (setting) return setting === "on";
  return process.env.NODE_ENV !== "production";
}

/** Sample accounts skip 2FA (and only exist while sample mode is on). */
export function isSampleUser(user: UserDocument): boolean {
  return Boolean(user.sample) && sampleModeEnabled();
}

/** Staff must use 2FA. Everyone must replace a temporary password. */
export function setupRequired(user: UserDocument): boolean {
  if (isSampleUser(user)) return false;
  return Boolean(user.mustChangePassword) || (user.role !== "student" && !user.twoFactor?.enabled);
}

/** Starts a new session (replacing any current one) and sets the cookie. */
export async function startSession(req: Request, res: Response, user: UserDocument, pendingTwoFactor: boolean) {
  const old = readCookie(req, COOKIE);
  if (old) await SessionModel.deleteOne({ tokenHash: hashToken(old) });
  const token = randomBytes(32).toString("base64url");
  await SessionModel.create({
    tokenHash: hashToken(token),
    user: user._id,
    pendingTwoFactor,
    expiresAt: new Date(Date.now() + SESSION_HOURS * 3_600_000),
    ip: req.ip,
    userAgent: req.get("user-agent")?.slice(0, 500),
  });
  setCookie(req, res, token, SESSION_HOURS * 3600);
}

export async function endSession(req: Request, res: Response) {
  const token = readCookie(req, COOKIE);
  if (token) await SessionModel.deleteOne({ tokenHash: hashToken(token) });
  setCookie(req, res, "", 0);
}

/** Signs a user out everywhere (after a password change, deactivation or reset). */
export async function endAllSessions(userId: Types.ObjectId, exceptSessionId?: Types.ObjectId) {
  await SessionModel.deleteMany({ user: userId, ...(exceptSessionId ? { _id: { $ne: exceptSessionId } } : {}) });
}

/** Reads the session cookie (if any) into req.auth. Never rejects a request. */
export const loadSession: RequestHandler = async (req, _res, next) => {
  try {
    const token = readCookie(req, COOKIE);
    if (token) {
      const session = await SessionModel.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
      const user = session && (await UserModel.findById(session.user));
      if (session && user && user.status === "active" && (!user.sample || sampleModeEnabled())) {
        req.auth = { session, user };
        if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
          await SessionModel.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date() } });
        }
      }
    }
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Rejects requests that aren't fully signed in. Pass allowSetup for the few
 * routes a user may use before finishing setup (new password, 2FA enrolment).
 */
export function requireAuth(options: { allowSetup?: boolean } = {}): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.auth;
    if (!auth) return next(new ApiError(401, "unauthenticated", "Please sign in"));
    if (auth.session.pendingTwoFactor) return next(new ApiError(401, "two_factor_required", "Enter your 2FA code"));
    if (!options.allowSetup && setupRequired(auth.user)) {
      return next(new ApiError(403, "setup_required", "Finish setting up your account first"));
    }
    next();
  };
}

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    const role = req.auth?.user.role as UserRole | undefined;
    if (!role) return next(new ApiError(401, "unauthenticated", "Please sign in"));
    if (!roles.includes(role)) return next(new ApiError(403, "forbidden", "You don't have access to this"));
    next();
  };
}

/** The signed-in user (call only after requireAuth). */
export function currentUser(req: Request): UserDocument {
  if (!req.auth) throw new ApiError(401, "unauthenticated", "Please sign in");
  return req.auth.user;
}
