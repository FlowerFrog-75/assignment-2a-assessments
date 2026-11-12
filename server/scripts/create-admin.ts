// Creates an administrator account. Use it once on a new installation to
// create the first admin. Everything after that is done in the web app.
//
//   pnpm admin:create --email it@school.edu.au --first Sam --last Lee
//
// Prints a temporary password. At first sign-in the admin must choose a new
// password and set up two-factor authentication.
import "./load-env";
import { randomInt } from "node:crypto";
import { parseArgs } from "node:util";
import { connectToDatabase, disconnectFromDatabase } from "../db/connect";
import { UserModel, appendAuditLog } from "../db/models";
import { hashPassword } from "../security/password";

const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      first: { type: "string" },
      last: { type: "string" },
      "reset-password": { type: "boolean", default: false },
    },
  });
  const email = values.email?.trim().toLowerCase();
  if (!email || (!values["reset-password"] && (!values.first || !values.last))) {
    console.error("Usage: pnpm admin:create --email <email> --first <first name> --last <last name>");
    console.error("       pnpm admin:create --email <email> --reset-password   (an admin who is locked out)");
    process.exitCode = 1;
    return;
  }

  await connectToDatabase();
  const password = Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  const existing = await UserModel.findOne({ email });

  if (values["reset-password"]) {
    if (!existing || existing.role !== "admin") throw new Error(`No admin account with email ${email}`);
    await UserModel.updateOne(
      { _id: existing._id },
      {
        $set: { passwordHash: await hashPassword(password), mustChangePassword: true, failedLogins: 0, status: "active", "twoFactor.enabled": false },
        $unset: { lockedUntil: "", "twoFactor.secret": "", "twoFactor.pendingSecret": "", "twoFactor.lastUsedStep": "" },
      },
    );
    await appendAuditLog({ actorRole: "system", action: "user.password.reset", status: "warning", details: { label: `Admin reset from the server console: ${email}` } });
    console.log(`\nPassword and 2FA reset for ${email}.`);
  } else {
    if (existing) throw new Error(`An account with email ${email} already exists`);
    const user = await UserModel.create({
      email,
      firstName: values.first!.trim(),
      lastName: values.last!.trim(),
      role: "admin",
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
    });
    await appendAuditLog({ actorRole: "system", action: "user.create", status: "success", resource: { type: "user", id: user._id.toString() }, details: { label: `Admin created from the server console: ${email}` } });
    console.log(`\nAdministrator created: ${user.firstName} ${user.lastName} <${email}>`);
  }
  console.log(`Temporary password: ${password}`);
  console.log("\nSign in at the app's address. You'll be asked to choose a new password and set up 2FA.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectFromDatabase());
