# Digital Skills Wallet

Agentic AI-enabled authentic assessments and a Digital Skills Wallet, built
for Kanavoogle (IFQ711, Team 01C). Students demonstrate seven core skills
through subject assessments. Results become skill coins in a wallet the
student owns and can selectively share. Teachers manage assessments and see
class and individual results.

- **Front end:** the 10-screen React app designed in Figma Make (`src/`): Vite, React 19, Tailwind v4.
- **API server:** Node.js + Express (`server/`). Connects the screens to the data.
- **Database:** a self-hosted MongoDB server (`mongodb/`).
- **Blockchain:** a Hyperledger Fabric 2.5 network kept by the school and Kanavoogle (`fabric/`). It is the tamper-proof record of skill coins.

Everything runs on your own machines. Nothing is hosted.

## Getting started

Needs Node.js 22, pnpm and Docker.

```bash
pnpm install

# Database
cp mongodb/.env.example mongodb/.env   # set the passwords
cp .env.example .env.local             # same app password in MONGODB_URI
pnpm db:up && pnpm db:seed             # start MongoDB, load demo data (prints logins and verification codes)

# Blockchain
pnpm fabric:up && pnpm ledger:sync     # start the Fabric network, write the skill coins to it

# App + API
pnpm dev:full                          # open the address Vite prints (http://localhost:8443 by default)
```

Each screen shows a green **Live data** badge when it's reading from MongoDB
and the blockchain. Without the API (for example in the Figma Make preview),
screens fall back to their built-in demo data, with a grey **Demo data**
badge. `pnpm dev` on its own still runs just the front end, as before.

## Showing the blockchain to the customer

Open **Blockchain Ledger** in the sidebar, and see the talk track in
[`fabric/README.md`](fabric/README.md#showing-it-to-the-customer). It covers:
- live tamper detection (`pnpm ledger:demo tamper` / `restore`)
- Public Verification with a real code
- the consent check on Individual Results

`pnpm ledger:demo` runs a narrated walkthrough in the terminal.

## Project structure

```
src/        React app (screens in src/pages, API hook in src/lib/api.ts)
server/     API server, MongoDB models, Fabric client, scripts. See server/README.md
mongodb/    Self-hosted MongoDB: Docker Compose, config, backups. See mongodb/README.md
fabric/     Hyperledger Fabric network and the skillcoin smart contract. See fabric/README.md
```

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` / `build` / `preview` | Front end only (Vite), as set up by Figma Make |
| `pnpm dev:full` | API server + front end together |
| `pnpm server` | API server only (restarts on changes) |
| `pnpm start` | Production: serves the built app and the API from one process (`pnpm build` first) |
| `pnpm typecheck` | Type-check the front end and the server |
| `pnpm db:up` / `db:down` / `db:seed` / `db:indexes` / `db:shell` / `db:logs` / `db:backup` | MongoDB |
| `pnpm fabric:up` / `fabric:down` / `fabric:status` / `fabric:clean` | Hyperledger Fabric network |
| `pnpm ledger:sync` | Write pending skill coins from MongoDB to the ledger |
| `pnpm ledger:demo` | Narrated blockchain walkthrough (`tamper` / `restore` for the live demo) |
