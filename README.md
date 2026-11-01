# Digital Skills Wallet

Agentic AI-enabled authentic assessments and a Digital Skills Wallet, built
for Kanavoogle (IFQ711, Team 01C). Students demonstrate seven core skills
through subject assessments. Results become skill coins in a wallet the
student owns and can selectively share. Teachers manage assessments and see
class and individual results.

Built with Next.js 16 (App Router), a **self-hosted MongoDB** server for
application data, and a **Hyperledger Fabric 2.5** blockchain for the
tamper-proof record of skill coins. Everything runs on your own machines,
with no hosted services.

## Getting started

```bash
npm install

# Database: a MongoDB server you run yourself (Docker)
cp mongodb/.env.example mongodb/.env   # set the passwords
cp .env.example .env.local             # same app password in MONGODB_URI
npm run db:up                          # start MongoDB
npm run db:seed                        # optional demo data (prints the demo logins)

# Blockchain: a Hyperledger Fabric network you run yourself (Docker)
npm run fabric:up                      # certificates, channel, smart contract
npm run ledger:sync                    # write the skill coins to the ledger

npm run dev                            # http://localhost:3000
```

- Database health check: <http://localhost:3000/api/health/db>
- **Blockchain demo for customers:** <http://localhost:3000/demo/ledger>, or `npm run ledger:demo` in the terminal

- Server setup (laptop, Linux server with Docker, or native install), backups and security: [`mongodb/README.md`](mongodb/README.md)
- Collections, rules and how to query them from app code: [`lib/db/README.md`](lib/db/README.md)
- The Fabric network, smart contract and **customer demo script**: [`fabric/README.md`](fabric/README.md)

## Project structure

```
app/                  Next.js routes (pages, layouts, route handlers)
  api/health/db/      GET: database health check
  demo/ledger/        Live blockchain verification demo page
lib/db/               MongoDB connection, constants and Mongoose models
lib/ledger/           Fabric Gateway client: skill coin contract, MongoDB→ledger sync, block reader
lib/security/         Password hashing
mongodb/              Self-hosted MongoDB server: Docker Compose, config, init and backup scripts
fabric/               Hyperledger Fabric network (network.sh, configs) and the skillcoin chaincode
scripts/              Database and ledger scripts (seed, indexes, sync, demo)
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js development server / production build / production server |
| `npm run lint` | ESLint |
| `npm run db:up` / `db:down` | Start / stop the MongoDB container |
| `npm run db:seed` | Load demo data (`-- --reset` wipes the database first) |
| `npm run db:indexes` | Sync MongoDB indexes (run on every production deploy) |
| `npm run db:shell` / `db:logs` / `db:backup` | mongosh as the app user / server logs / backup |
| `npm run fabric:up` / `fabric:down` / `fabric:status` / `fabric:clean` | Start / stop / inspect / delete the Fabric network |
| `npm run ledger:sync` | Write pending skill coins from MongoDB to the ledger |
| `npm run ledger:demo` | Narrated blockchain walkthrough (`-- tamper` / `-- restore` for the web demo) |
