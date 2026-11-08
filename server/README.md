# Server (`server/`)

The Node.js side of the Digital Skills Wallet. Browsers can't talk to MongoDB
or the Hyperledger Fabric ledger directly, so this folder holds everything
that does, plus a small API the React screens in `src/` call.

```
server/
  index.ts      Express server: security headers, /api routes, the built app in production,
                and the background ledger retry loop
  api/          Routes, one file per area (auth, admin, teaching, assessments, students,
                teacher, public, ledger, ai)
  ai/           The AI assistant: question author + validator agents, marking and
                feedback suggestions, and the labelled offline stand-in
  auth/         Sessions, role checks, rate limiting
  assessment/   The assessment engine (seeded papers, marking) and coin/achievement issuing
  db/           MongoDB connection, constants and Mongoose models
  ledger/       Fabric Gateway client: skillcoin contract, MongoDB→ledger sync, block reader
  security/     Password hashing (scrypt), TOTP 2FA, encryption of 2FA secrets (AES-256-GCM)
  scripts/      Command-line tools: create admin, starter questions, sample school, indexes,
                ledger sync and audit
```

Nothing in `src/` may import from `server/`. This folder uses database
passwords and the organisation's private signing key.

## Running it

```bash
pnpm dev:full   # API (http://localhost:4000) + Vite together; Vite proxies /api to the API
pnpm api        # API only, restarts on file changes
pnpm build && NODE_ENV=production pnpm start   # production: one process serves the app and the API
pnpm typecheck  # browser app and server
```

The API reads `.env.local` (then `.env`) from the project root. See
`.env.example`. Server settings have no `VITE_` prefix, so Vite never exposes
them to the browser.

## Security

- **Sign-in:** email + password (scrypt). Staff (teachers, admins) must also
  use a TOTP authenticator app; their secrets are encrypted with a key derived
  from `APP_SECRET`. New accounts and admin resets get a temporary password
  that must be changed at first sign-in.
- **Sign-up:** only with a join code. Class codes (8 characters, 40 random
  bits) enrol a student in that class; the staff code (12 characters, stored
  encrypted) creates a teacher, who must then set up 2FA. Either can be turned
  off or replaced at any time. The first administrator needs the one-time setup
  code printed in the server log, which stops working once an admin exists.
- **Sessions:** a random token in an `HttpOnly`, `SameSite=Strict` cookie
  (`Secure` in production); only its SHA-256 hash is stored (`sessions`
  collection, expires after 12 hours). A new token is issued after the second
  factor, and other sessions end on a password change, 2FA reset or deactivation.
- **Brute force:** 5 wrong passwords or codes lock the account for 15 minutes;
  per-account and generous per-IP rate limits (schools share one IP address).
- **CSRF:** every non-GET request must carry `X-Requested-With: dsw`, which a
  browser won't send cross-site without a CORS preflight this server never allows.
- **Headers:** CSP, `X-Frame-Options: DENY`, `nosniff`, HSTS behind HTTPS,
  `Cache-Control: no-store` on the API.
- **Access rules:** every route checks the role. Teachers see only their
  classes, and individual results only with the student's consent. Admins
  can see everything (oversight). Every view of a student's data, and every
  change, is written to the hash-chained audit log; students see entries about themselves.
- **Sample school:** accounts made by `pnpm sample:school` are flagged `sample`.
  They skip 2FA and use `password123`, so they only work while sample mode is
  on (`SAMPLE_SCHOOL=on`, or unset outside production). With it off they are
  refused at sign-in and their sessions end.

## How the screens get their data

Each screen calls `useApiData(path, sampleData)` (`src/lib/api.ts`) and shows
a spinner, then the data, or a clear message (not signed in, no access, no
results yet, server unreachable). Sample data is only shown in the
development **design preview** (offered on the sign-in page when the API
isn't running, e.g. in Figma Make). Production builds never show it.

## API routes

All responses are JSON, errors included (`{ "error": "...", "message": "..." }`).
Changes (POST/PUT/PATCH/DELETE) need the `X-Requested-With: dsw` header.

| Area | Routes | Who |
| --- | --- | --- |
| Health | `GET /health` | anyone |
| Sign-up | `GET /signup/status`, `POST /signup/setup` (first admin, needs the setup code from the log), `POST /signup/lookup`, `POST /signup` (with a class or staff code), `POST /me/classes/join` | anyone / student |
| Join codes | `POST /classes/:id/join-code` (teacher of the class, admin), `POST /admin/school/staff-code` (admin) | staff |
| Sign-in | `POST /auth/login`, `POST /auth/2fa/verify`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/password`, `POST /auth/2fa/setup`, `POST /auth/2fa/enable` | anyone / signed in |
| Public verification | `GET /verify/:code` | anyone (rate-limited, audit-logged) |
| Student | `GET /me/dashboard`, `/me/wallet`, `/me/results/latest?attempt=`, `/me/assessments`; `POST /me/assessments/:templateId/start`; `GET /me/attempts/:id`; `PUT /me/attempts/:id/responses`; `POST /me/attempts/:id/submit`; `GET/POST /me/consents`, `DELETE /me/consents/:id`; `GET/POST /me/verification-links`, `POST /me/verification-links/:id/revoke` | student (own data only) |
| Results | `GET /classes/current/results?classId=`, `GET /students/:walletId/profile`, `POST /students/:walletId/notes` | teacher (own classes, with consent), admin |
| Question bank | `GET /items`, `POST /items`, `PUT /items/:id`, `POST /items/:id/review`, `POST /items/:id/retire` | teacher, admin |
| Templates | `GET /templates`, `GET/PUT /templates/:id`, `POST /templates`, `POST /templates/:id/status`, `POST /templates/:id/duplicate`, `PUT/DELETE /templates/:id/assignments/:classId` | teacher (own templates and classes), admin |
| Marking | `GET /marking`, `GET/POST /marking/:id`, `POST /marking/release` | teacher (own classes), admin |
| AI | `GET /ai/status`; `POST /ai/item-jobs`, `POST /ai/templates/:id/fill` (both return `202 { jobId }`); `GET /ai/jobs`, `GET /ai/jobs/:id`; `POST /marking/:id/ai-suggest`, `POST /marking/:id/ai-feedback` (only with the school's AI marking setting on; never save) | teacher, admin |
| Audit log | `GET /audit-logs` | everyone, filtered by role |
| Administration | `GET /admin/overview`; `GET/PUT /admin/school`; `GET/POST /admin/users`, `PATCH /admin/users/:id`, `POST /admin/users/:id/{reset-password,reset-2fa,unlock,sign-out}`; `GET/POST /admin/classes`, `PUT /admin/classes/:id`; `GET /admin/wallet-events`, `POST /admin/wallet-events/:id/revoke`, `POST /admin/ledger/sync` | admin |
| Blockchain | `GET /ledger/overview?wallet=` | admin |

## The assessment workflow

1. Teachers add questions (or load the starter set) and **approve** them.
   Only approved questions can be used.
2. A template's **blueprint** says how many questions to draw per skill and
   complexity. It can be published only if the question bank has enough.
3. When a student starts, the engine draws their paper with a random **seed**
   (mulberry32 + Fisher-Yates over approved items in a stable order), so the
   paper can always be rebuilt. Answers autosave; the timer is enforced on the
   server, which submits automatically when time runs out.
4. Multiple-choice answers are marked automatically; teachers mark written
   answers against the model answer and marking guide.
5. On **release**, the student sees the result, earns 10 skill coins per
   mark in each skill plus any achievements, and the coins are written to
   Fabric in the background (with the result's fingerprint).

## The AI assistant (`ai/`)

`ai/provider.ts` picks the mode: **claude** when `ANTHROPIC_API_KEY` is set,
**offline** (a scripted stand-in, labelled *Offline demo · not real AI*) when
`AI_OFFLINE_DEMO=on` or in sample mode without a key, otherwise **off** (the
buttons explain that AI isn't set up). Requests use the server-side refusal
fallback (`fallbacks: "default"`), so a declined request is retried on the
fallback model rather than failing.

**Question generator** (`ai/item-agent.ts`, run as a background `AiJob` whose
steps the UI shows live):

1. **Author agent**: a tool-use loop with `search_item_bank` (the school's
   approved questions as examples), `check_similarity` (avoid near-duplicates)
   and `submit_item`, which is checked on the server (options, answer key,
   skill, complexity) and returns errors for the agent to fix.
2. **Validator agent**: a separate call with structured output that sees only
   the finished questions, never the author's reasoning. It checks the answer
   key, a single best answer, the skill, the complexity and age-appropriateness.
3. Questions that fail are **revised once** and validated again.
4. Passing questions are saved as `pending_review`, failing ones as `draft`,
   with `source: "ai"` and `generation.validation`. **A teacher must approve
   every one** (the model requires `review.reviewedBy`).

**Marking** (`ai/marking-agent.ts`): suggested marks (with reasons and a
confidence) for written answers, and a feedback draft. They receive the
question, marking guide, model answer and answer text, with no name, email or
wallet ID, only when an admin has turned on `school.aiMarkingEnabled`, and
they never save anything.

Limits: one running job per teacher, `AI_DAILY_JOBS` per day (default 20),
`AI_MAX_ITEMS_PER_JOB` (default 10), and a per-user rate limit on marking
suggestions. Every AI action is audit-logged.

Using the data layer from new routes:

```ts
import { UserModel, skillSummary, walletBalances, hasConsent } from "../db";
import { getLedgerWallet } from "../ledger";

const student = await UserModel.findOne({ walletId: "KGSC-2026-AW-8398" });
const profile = await skillSummary({ student: student!._id }); // [{ skill, percent, ... }]
const coins = await walletBalances(student!._id);              // [{ skill, coins }]
const onChain = await getLedgerWallet(student!.walletId!);     // balances and entries on the ledger
```

## Database collections (`db/`)

The seven skills (`analytical-thinking`, `research`, `critical-thinking`,
`creativity`, `decision-making`, `collaboration`, `adaptability`) are
defined once in `db/constants.ts`. Every collection that stores a skill
validates against that list.

| Collection | Model | What it holds | Rules enforced |
| --- | --- | --- | --- |
| `users` | `UserModel` | Students, teachers and admins; 2FA settings; public keys | Unique email and wallet ID. `passwordHash` and the 2FA secret are never returned unless explicitly selected, and are always removed from JSON |
| `school` | `SchoolModel` | The school's name, year, term and wallet ID prefix (set in School Settings) | One document |
| `sessions` | `SessionModel` | Signed-in sessions (SHA-256 of the cookie token), with IP and browser | TTL index removes expired sessions |
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
  `maxPoints`.
- **Indexes** are built automatically in development. In production run
  `pnpm db:indexes` on deploy.
