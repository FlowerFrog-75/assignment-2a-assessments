# Digital Skills Wallet

Agentic AI-enabled authentic assessments and a Digital Skills Wallet, built
for Kanavoogle (IFQ711, Team 01C). Students demonstrate seven core skills
through subject assessments. Results become skill coins in a wallet the
student owns and can selectively share. Teachers manage assessments and see
class and individual results.

Built with Next.js 16 (App Router) and a **self-hosted MongoDB** server (no
hosted database service).

## Getting started

```bash
npm install

# Database: a MongoDB server you run yourself (Docker)
cp mongodb/.env.example mongodb/.env   # set the passwords
cp .env.example .env.local             # same app password in MONGODB_URI
npm run db:up                          # start MongoDB
npm run db:seed                        # optional demo data (prints the demo logins)

npm run dev                            # http://localhost:3000
```

Check the database connection at <http://localhost:3000/api/health/db>.

- Server setup (laptop, Linux server with Docker, or native install), backups and security: [`mongodb/README.md`](mongodb/README.md)
- Collections, rules and how to query them from app code: [`lib/db/README.md`](lib/db/README.md)

## Project structure

```
app/                  Next.js routes (pages, layouts, route handlers)
  api/health/db/      GET: database health check
lib/db/               MongoDB connection, constants and Mongoose models
lib/security/         Password hashing
mongodb/              Self-hosted MongoDB server: Docker Compose, config, init and backup scripts
scripts/              Database scripts (seed, indexes)
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
