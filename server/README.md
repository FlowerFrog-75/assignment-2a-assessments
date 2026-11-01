# Server (`server/`)

The Node.js side of the Digital Skills Wallet. Browsers can't talk to MongoDB
or the Hyperledger Fabric ledger directly, so this folder holds everything
that does, plus a small API the React screens in `src/` call.

```
server/
  index.ts      Express server: /api routes (and the built app in production)
  api/          Routes, one file per area. Each returns the same shape as the
                mock data in the matching src/pages screen
  db/           MongoDB connection, constants and Mongoose models
  ledger/       Fabric Gateway client: skillcoin contract, MongoDB→ledger sync, block reader
  security/     Password hashing (scrypt)
  scripts/      Command-line tools: seed, indexes, ledger sync, customer demo
```

Nothing in `src/` may import from `server/`. This folder uses database
passwords and the organisation's private signing key.

## Running it

```bash
pnpm dev:full   # API (http://localhost:4000) + Vite together; Vite proxies /api to the API
pnpm server     # API only, restarts on file changes
pnpm build && NODE_ENV=production pnpm start   # production: one process serves the app and the API
pnpm typecheck  # browser app and server
```

The API reads `.env.local` (then `.env`) from the project root. See
`.env.example`. Server settings have no `VITE_` prefix, so Vite never exposes
them to the browser.

## How the screens get their data

Each screen calls `useApiData(path, mockData)` (`src/lib/api.ts`):

- **API answers:** the screen shows live data and a green **Live data** badge.
- **API not reachable** (not started, or the static Figma Make preview): the
  screen shows its original mock data and a grey **Demo data · API offline**
  badge. Nothing breaks.
- **API refuses** (e.g. 403 when a student hasn't given consent): the screen
  shows that message.

Login isn't built yet. Student screens show the demo student
(`DEMO_STUDENT_WALLET` in `src/lib/api.ts`, Jordan Smith) and teacher screens
act as the demo teacher (`DEMO_TEACHER_EMAIL`, Ms Chen). Swap these for the
signed-in user once authentication exists.

## API routes

All responses are JSON, errors included (`{ "error": "...", "message": "..." }`).

| Route | Screen | Notes |
| --- | --- | --- |
| `GET /api/health` | - | MongoDB and Fabric status. 503 if MongoDB is down |
| `GET /api/students/:walletId/dashboard` | Student Dashboard | Skills, coins, active and completed assessments |
| `GET /api/students/:walletId/wallet` | Skills Wallet | Includes how many coins are committed on the ledger |
| `GET /api/students/:walletId/results/latest` | Results | The most recently released result |
| `GET /api/students/:walletId/profile` | Individual Results | **403 `consent_required`** without the student's consent. Every attempt is audit-logged |
| `GET /api/classes/current/results` | Class Results | The demo teacher's class |
| `GET /api/templates` | Assessment Templates | |
| `GET /api/audit-logs` | Access Logs | Includes a check of the hash chain |
| `GET /api/verify/:code` | Public Verification | No login. Shows only the skills the student shared, checked against the ledger (balances, every coin present, evidence fingerprints). Audit-logged |
| `GET /api/demo/ledger?wallet=` | Blockchain Ledger | Off in production unless `ENABLE_LEDGER_DEMO=true` |

Using the data layer from new routes:

```ts
import { UserModel, skillSummary, walletBalances, hasConsent } from "../db";
import { getLedgerWallet } from "../ledger";

const jordan = await UserModel.findOne({ walletId: "DSW-2024-JS-1147" });
const profile = await skillSummary({ student: jordan!._id }); // [{ skill, percent, ... }]
const coins = await walletBalances(jordan!._id);              // [{ skill, coins }]
const onChain = await getLedgerWallet(jordan!.walletId!);     // balances and entries on the ledger
```

## Database collections (`db/`)

The seven skills (`analytical-thinking`, `research`, `critical-thinking`,
`creativity`, `decision-making`, `collaboration`, `adaptability`) are
defined once in `db/constants.ts`. Every collection that stores a skill
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
| `verificationlinks` | `VerificationLinkModel` | Student-created public verification links that show **only the skills the student picked** | Short codes like `K7Q2-M9XD-4PLA`; only their SHA-256 hash is stored. Revoked or expired links don't resolve |
| `consents` | `ConsentModel` | A student's permission for a teacher to see their individual results | One active consent per student, teacher and scope. Revoking keeps the record |
| `teachernotes` | `TeacherNoteModel` | Teacher notes on a student's progress | |
| `auditlogs` | `AuditLogModel` | Logins, data access, admin actions and coin issuance, including entries students can see ("who viewed my data") | **Append-only and hash-chained.** Write with `appendAuditLog()` and check with `verifyAuditChain()` |

### Database helper functions

| Function | Use |
| --- | --- |
| `connectToDatabase()` / `disconnectFromDatabase()` | Open or reuse the connection pool. Close it in scripts |
| `skillSummary({ student \| classGroup \| template })` | Per-skill score and % across released attempts (skills radar, class averages) |
| `walletBalances(studentId)` | Coins per skill (issued minus revoked) |
| `hasConsent(student, teacher, scope)` | Check consent before showing individual data |
| `createVerificationLink({...})` / `resolveVerificationToken(code)` | Create a shareable link (returns its code once); look one up and count the view |
| `appendAuditLog({...})` / `verifyAuditChain()` | Add to the tamper-evident log; check it hasn't been altered |
| `hashPassword()` / `verifyPassword()` (`security/password.ts`) | scrypt password hashing (OWASP parameters) |

## Design notes

- **MongoDB is the application database, not the verification ledger.** The
  project plan chose Hyperledger Fabric for coin records because MongoDB is
  "not suitable as the immutable verification layer". `walletevents` is the
  app's copy of each coin event. `pnpm ledger:sync` writes it to Fabric
  and records `ledger.status` (`pending` → `committed`), the `txId` and the
  `blockNumber`. The UI should only show a coin as verified once it is
  committed. See [`fabric/README.md`](../fabric/README.md).
- **Append-only collections** (`walletevents`, `auditlogs`) reject deletes,
  replacements and edits through Mongoose (see `db/plugins/append-only.ts`).
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
  `pnpm db:indexes` on deploy.
