# Digital Skills Wallet

Agentic AI-enabled authentic assessments and a Digital Skills Wallet, built
for Kanavoogle (IFQ711, Team 01C). Students demonstrate seven core skills
through subject assessments. Results become skill coins in a wallet the
student owns and can selectively share. Teachers manage assessments and see
class and individual results.

- **Front end:** the React app designed in Figma Make (`src/`): Vite, React 19, Tailwind v4.
- **API server:** Node.js + Express (`server/`). Connects the screens to the data.
- **Database:** a self-hosted MongoDB server (`mongodb/`).
- **Blockchain:** a Hyperledger Fabric 2.5 network kept by the school and Kanavoogle (`fabric/`). It is the tamper-proof record of skill coins.

Everything runs on your own machines. Nothing is hosted.

## Who does what

| Role | Signs in with | Can |
| --- | --- | --- |
| **Administrator** | password + 2FA | Set up the school, create and manage every account and class, oversee all results, coins, the blockchain and the audit log |
| **Teacher** | password + 2FA | Approve questions, build and assign assessments, mark and release results, see their own classes (individual results only with student consent) |
| **Student** | password | Sit assessments, see results and their skills wallet, give or withdraw consent, share verified skills with a link, see who accessed their data |
| **Employer / anyone** | nothing | Check a credential a student shared (`/verify/<code>`) |

## Putting it on a server

See **[`deploy/README.md`](deploy/README.md)**: MongoDB, the Fabric network and
the app in Docker on one Linux server, with automatic HTTPS (Caddy), backups
and updates. The first administrator is created from the command line; everything
else is done in the web app.

## Running it on your computer (development)

Needs Node.js 22, pnpm and Docker.

```bash
pnpm install

# Database
cp mongodb/.env.example mongodb/.env   # set the passwords
cp .env.example .env.local             # same app password in MONGODB_URI
pnpm db:up

# Blockchain
pnpm fabric:up

# First administrator (prints a temporary password)
pnpm admin:create --email you@school.edu.au --first Your --last Name

# Optional: a starter question bank (teachers approve the questions in the app)
pnpm db:starter-items

# App + API
pnpm dev:full                          # open the address Vite prints (http://localhost:8443 by default)
```

Sign in with the temporary password, choose your own password and set up
two-factor authentication. Then follow the **Getting started** checklist on
the admin overview.

The screens only ever show real data. In development, if the API isn't
running (for example in the Figma Make preview), the sign-in page offers a
**design preview** that shows each screen with its sample data, clearly
labelled. Production builds don't include it.

## Proving the blockchain works

- **Blockchain Ledger** (admin): the organisations, a student's wallet read
  from the ledger, each result's fingerprint checked against the database,
  and the chain of blocks with their hashes recomputed.
- `pnpm ledger:verify` checks every wallet against the database and exits
  with an error if anything was changed (`--probe` also shows Kanavoogle can't issue coins).
- A shared verification link checks the ledger live, so an employer sees
  whether the result was changed after the coins were recorded.

See [`fabric/README.md`](fabric/README.md) for how the network works.

## Project structure

```
src/        React app (screens in src/pages, API client in src/lib/api.ts, sign-in in src/lib/auth.tsx)
server/     API server, MongoDB models, Fabric client, scripts. See server/README.md
mongodb/    Self-hosted MongoDB: Docker Compose, config, backups. See mongodb/README.md
fabric/     Hyperledger Fabric network and the skillcoin smart contract. See fabric/README.md
deploy/     Production: app Dockerfile, Docker Compose with Caddy (HTTPS), backups. See deploy/README.md
```

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` / `build` / `preview` | Front end only (Vite), as set up by Figma Make |
| `pnpm dev:full` | API server + front end together |
| `pnpm api` | API server only (restarts on changes) |
| `pnpm start` | Production mode without Docker: serves the built app and the API from one process (`pnpm build` first; needs `APP_SECRET`) |
| `pnpm typecheck` | Type-check the front end and the server |
| `pnpm db:up` / `db:down` / `db:indexes` / `db:shell` / `db:logs` / `db:backup` | MongoDB |
| `pnpm admin:create` | Create an administrator (`--reset-password` for a locked-out admin) |
| `pnpm db:starter-items` | Load 28 starter questions (pending teacher approval) |
| `pnpm fabric:up` / `fabric:down` / `fabric:status` / `fabric:clean` | Hyperledger Fabric network |
| `pnpm ledger:sync` | Write pending skill coins to the ledger now (the app also does this automatically) |
| `pnpm ledger:verify` | Audit the ledger against the database (read-only) |
