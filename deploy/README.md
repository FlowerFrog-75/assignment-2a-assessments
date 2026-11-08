# Deploying to a server

This puts the Digital Skills Wallet on one Linux server that you control
(school data centre, on-premises box, or a VM). Nothing is hosted by a third
party. Everything runs in Docker:

```
Internet ──443──▶ Caddy (HTTPS, automatic certificates)
                    │
                    ▼
                  app (React + API, port 4000, not exposed)
                    │                    │
                    ▼                    ▼
               MongoDB 8           Hyperledger Fabric
          (mongodb/, localhost)   (fabric/: orderer, 2 peers, chaincode)
```

## 1. What you need

- A Linux server (Ubuntu 24.04 LTS is a good choice) with 2+ CPU cores,
  4 GB+ RAM and 40 GB+ disk.
- Docker Engine with the Compose plugin (`docker compose version`).
- Node.js 22 and pnpm (to run the setup commands), or run them in the app container (shown below).
- A domain name, e.g. `wallet.yourschool.edu.au`, with a DNS **A record**
  pointing at the server.
- Firewall: allow **80** and **443** in. Keep 27017 (MongoDB) and 7051/9051
  (Fabric) closed to the outside; they only listen on localhost by default.

## 2. Get the code

```bash
sudo mkdir -p /opt/dsw && sudo chown "$USER" /opt/dsw
git clone <repository-url> /opt/dsw && cd /opt/dsw
pnpm install
```

## 3. Start MongoDB

```bash
cp mongodb/.env.example mongodb/.env
nano mongodb/.env          # set strong, different root and app passwords
pnpm db:up                 # starts MongoDB and creates the least-privilege app account
```

See [`mongodb/README.md`](../mongodb/README.md) for details.

## 4. Start the blockchain network

```bash
pnpm fabric:up             # certificates, channel, smart contract (takes a few minutes the first time)
pnpm fabric:status
```

This creates the school's and Kanavoogle's certificates and keys in
`fabric/organizations/`, owned by your user. **Back this folder up**: it is
the school's identity on the network. See [`fabric/README.md`](../fabric/README.md).

## 5. Configure and start the app

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env
```

| Setting | What to put |
| --- | --- |
| `DOMAIN` | Your domain, e.g. `wallet.yourschool.edu.au` |
| `APP_SECRET` | Output of `openssl rand -hex 32`. Keep a copy in your password manager. |
| `MONGODB_URI` | Use the app username and password from `mongodb/.env`, with host `mongodb` |
| `APP_UID` / `APP_GID` | Output of `id -u` and `id -g` (the user who ran `fabric:up`) |

Then build and start:

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
docker compose -f deploy/docker-compose.yml --env-file deploy/.env ps
curl https://wallet.yourschool.edu.au/api/health
```

Caddy gets the HTTPS certificate on first start (it needs ports 80 and 443
reachable from the internet). The health check should report
`"status":"ok"` with MongoDB and Fabric both `ok`.

## 6. Set up the school and the first administrator

While there is no administrator, the app prints a one-time **setup code** in
its log:

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs app | grep -A1 "setup code"
```

Open your domain in a browser. It shows **Set up your school**: enter the
setup code, the school's name and your own details. You're signed in as the
first administrator and asked to set up two-factor authentication. Only
someone who can read the server's log can do this, and it works once.

(Prefer the command line? `create-admin.ts --email ... --first ... --last ...`
in the app container does the same and prints a temporary password.)

Everything else happens in the web app, under **Administration**:

1. **School Settings**: name, year, term, wallet ID prefix, and the **staff
   sign-up code**.
2. **People**, either way:
   - **They sign up themselves.** Turn on the staff code and give it to
     teachers; each class has a **class code** (shown to its teachers on Class
     Results) that students use to sign up and join that class, or a share
     link like `https://your-domain/join/K7Q2-M9XD`. Codes can be turned off
     or replaced at any time.
   - **You create them.** **Users** → create accounts one at a time or paste a
     list from a spreadsheet. Each gets a temporary password (shown once).
3. **Classes**: create classes and choose their teachers (students who sign up
   with a class code are enrolled automatically).

Teachers then use **Question Bank** (approve questions), **Assessment
Templates** (build and assign an assessment) and **Marking & Release**.

Optional: load a starter set of 28 questions (four per skill, pending a
teacher's approval):

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec app \
  node_modules/.bin/tsx server/scripts/starter-items.ts
```

## 7. Backups

`deploy/backup.sh` saves the database, the Fabric certificates, the ledger
data and `deploy/.env`, and keeps 14 days:

```bash
sudo mkdir -p /srv/dsw-backups && sudo chown "$USER" /srv/dsw-backups
crontab -e
# add:
30 2 * * * /opt/dsw/deploy/backup.sh /srv/dsw-backups >> /var/log/dsw-backup.log 2>&1
```

Copy `/srv/dsw-backups` to another location too (another server, or
encrypted offsite storage). To restore the database: `mongodb/restore.sh <archive>`.

## 8. Checking the blockchain

`pnpm ledger:verify` compares every student's coins and assessment
fingerprints on the ledger with the database. It is read-only, so it is safe to run
any time, or nightly from cron. It exits with an error if anything doesn't
match. Add `--probe` to also confirm that Kanavoogle can't issue coins.

Skill coins are written to the ledger automatically when results are
released, and retried every 5 minutes if the network was unavailable.
Administrators can see the status of each coin under **Skill Coins**.

## Updating

```bash
cd /opt/dsw
git pull
pnpm install
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

Database changes are applied automatically (indexes are created at start-up).

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Browser shows a certificate error | Check the DNS A record points at this server and ports 80/443 are open, then `docker compose ... logs caddy` |
| Health check: `mongo: ok: false` | `pnpm db:up`; check the username and password in `MONGODB_URI` match `mongodb/.env` |
| Health check: `fabric: ok: false` | `pnpm fabric:status`; check `APP_UID`/`APP_GID` match the owner of `fabric/organizations` |
| A staff member lost their phone | Admin → Users → **Reset 2FA**. They set it up again at next sign-in. |
| Someone forgot their password | Admin → Users → **Reset password** gives a new temporary password. |
| The only admin is locked out | Run `create-admin.ts --email <their email> --reset-password` in the app container (as in step 6). |
| `APP_SECRET` was lost | Set a new one; every staff member then needs their 2FA reset by an admin. |
