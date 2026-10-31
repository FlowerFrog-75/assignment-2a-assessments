# Data layer (`lib/db`)

Mongoose models for the Digital Skills Wallet, plus the connection to the
self-hosted MongoDB server. For running the server itself, see
[`mongodb/README.md`](../../mongodb/README.md).

## Using it from app code

Import from `@/lib/db` in Server Components, Route Handlers and Server
Actions. It is marked `server-only`, so importing it into a Client Component
fails the build. Client Components that only need skill names can import
`@/lib/db/constants`.

```ts
import { connectToDatabase, UserModel, skillSummary, walletBalances, hasConsent } from "@/lib/db";

await connectToDatabase(); // reuses one connection pool

const jordan = await UserModel.findOne({ walletId: "DSW-2026-JS-1147" });
const profile = await skillSummary({ student: jordan!._id }); // [{ skill, percent, ... }]
const coins = await walletBalances(jordan!._id); // [{ skill, coins }]

if (await hasConsent(jordan!._id, teacherId, "individual_results")) {
  // the teacher may open Jordan's individual results
}
```

`app/api/health/db/route.ts` is a minimal working example.

## Collections

The seven skills (`analytical-thinking`, `research`, `critical-thinking`,
`creativity`, `decision-making`, `collaboration`, `adaptability`) are
defined once in `constants.ts`. Every collection that stores a skill
validates against that list.

| Collection | Model | What it holds | Rules enforced |
| --- | --- | --- | --- |
| `users` | `UserModel` | Students, teachers and admins; 2FA settings; public keys | Unique email and wallet ID. `passwordHash` and the 2FA secret are never returned unless explicitly selected, and are always removed from JSON |
| `classes` | `ClassGroupModel` | Teaching groups (subject, year, term, teachers, students) | At least one teacher |
| `assessmenttemplates` | `AssessmentTemplateModel` | Teacher-defined, subject-linked assessments with a **blueprint** (how many items of each skill and complexity to draw) and class assignments with due dates | Blueprint skills must be template skills. A published template needs a blueprint. Text index for search |
| `assessmentitems` | `AssessmentItemModel` | The item bank: questions tagged by subject, skill and complexity (1–5). Can be teacher-written or AI-drafted (with the AI's own validation result) | **Only an educator can approve an item** (`review.reviewedBy` is required). Answer keys are hidden from queries by default. Multiple-choice answers must match an option |
| `assessmentattempts` | `AssessmentAttemptModel` | A student's sitting: the **seed**, the questions served, autosaved responses, timer, and the released result with per-skill scores | One in-progress attempt per student per template (so students resume) |
| `walletevents` | `WalletEventModel` | Skill coins issued and revoked; the balance is the sum of a student's events. `ledger` tracks the Hyperledger Fabric sync | **Append-only.** Coins can't be issued twice for the same attempt and skill. A revocation must reference the event it reverses, and each event can only be revoked once |
| `achievements` | `AchievementModel` | Badges ("First Assessment", "Team Player") with the attempt that earned them as evidence | One of each badge per student |
| `verificationlinks` | `VerificationLinkModel` | Student-created public verification links that show **only the skills the student picked** | Only a SHA-256 hash of the token is stored. Revoked or expired links don't resolve |
| `consents` | `ConsentModel` | A student's permission for a teacher to see their individual results | One active consent per student, teacher and scope. Revoking keeps the record |
| `teachernotes` | `TeacherNoteModel` | Teacher notes on a student's progress | |
| `auditlogs` | `AuditLogModel` | Logins, data access, admin actions and coin issuance, including entries students can see ("who viewed my data") | **Append-only and hash-chained.** Write with `appendAuditLog()` and check with `verifyAuditChain()` |

### Helper functions

| Function | Use |
| --- | --- |
| `connectToDatabase()` / `disconnectFromDatabase()` | Open or reuse the connection pool. Close it in scripts |
| `skillSummary({ student \| classGroup \| template })` | Per-skill score and % across released attempts (skills radar, class averages) |
| `walletBalances(studentId)` | Coins per skill (issued minus revoked) |
| `hasConsent(student, teacher, scope)` | Check consent before showing individual data |
| `createVerificationLink({...})` / `resolveVerificationToken(token)` | Create a shareable link (returns the raw token once); look one up and count the view |
| `appendAuditLog({...})` / `verifyAuditChain()` | Add to the tamper-evident log; check it hasn't been altered |
| `hashPassword()` / `verifyPassword()` (`lib/security/password.ts`) | scrypt password hashing (OWASP parameters) |

## Design notes

- **MongoDB is the application database, not the verification ledger.** The
  project plan chose Hyperledger Fabric for coin records because MongoDB is
  "not suitable as the immutable verification layer". `walletevents` is the
  app's copy of each coin event: it holds `ledger.status` (`pending` →
  `committed`) and the Fabric `txId`, and the UI should only show a coin as
  verified once it is committed.
- **Append-only collections** (`walletevents`, `auditlogs`) reject deletes,
  replacements and edits through Mongoose (see `plugins/append-only.ts`).
  That guards against bugs in app code. It is not a security boundary,
  because someone with direct database access could still edit data. That
  is why the audit log is hash-chained, and why coins also go to Fabric.
- **Reproducible assessments.** An attempt stores its `seed` and the exact
  questions served. The assessment engine (still to be built) should draw
  items for a template's blueprint using only approved items and that seed,
  so the same seed always produces the same paper.
- **Scoring by complexity.** Each served question records its complexity and
  `maxPoints`. The demo data uses points = complexity.
- **Indexes** are built automatically in development. In production run
  `npm run db:indexes` on deploy.
