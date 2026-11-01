# Self-hosted MongoDB server

The Digital Skills Wallet keeps its application data in a **MongoDB Community
server that you run yourself**: on a laptop for development, or on any Linux
server (university VM, VPS or on-premises machine) for the demo and
production. It does not use a hosted service such as MongoDB Atlas.

There are two ways to run it:

- **Docker** (recommended): the same setup works on a laptop and on a server.
- **Native install**: MongoDB installed with `apt`, for servers without Docker.

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | The MongoDB 8.0 server: login required, data kept in a Docker volume, health check, log rotation |
| `.env.example` | Template for `mongodb/.env`: root and app passwords, port, bind address |
| `init/01-create-app-user.js` | Creates the app's least-privilege user (runs automatically under Docker) |
| `mongod.conf` | Server config for a native (non-Docker) install |
| `backup.sh` / `restore.sh` | Gzipped `mongodump` backups and restores |

The database code the app uses (connection, models and the API that serves
the screens) is in [`server/`](../server/README.md).

---

## 1. Local development (Docker)

Requires [Docker Desktop](https://docs.docker.com/get-docker/) or Docker Engine with the Compose plugin.

```bash
# 1. Server settings. Replace both "change-me" passwords
#    (e.g. with the output of: openssl rand -hex 24)
cp mongodb/.env.example mongodb/.env

# 2. App settings. Put the SAME app password into MONGODB_URI
cp .env.example .env.local

# 3. Start MongoDB (waits until it reports healthy)
pnpm db:up

# 4. Optional: load demo data that matches the UI prototype
pnpm db:seed

# 5. Run the API server and the app together, and check the connection
pnpm dev:full
# open http://localhost:4000/api/health  ->  {"status":"ok","mongo":{"ok":true,...},...}
```

On the first start, Docker creates two accounts:

- **Root** (`MONGO_ROOT_USERNAME`): admin account for maintenance only.
- **App** (`MONGO_APP_USERNAME`): the only account the API server uses. It
  can read and write the `digital_skills_wallet` database and nothing else:
  no other databases, no user management.

> The accounts are created **only on the first start of an empty volume**.
> If you change the passwords in `mongodb/.env` later, either change them in
> MongoDB too (see [Troubleshooting](#troubleshooting)) or, on a dev machine,
> wipe everything with `docker compose -f mongodb/docker-compose.yml down -v`.

---

## 2. Deploying to a server (Docker)

Works on any Linux server with
[Docker Engine](https://docs.docker.com/engine/install/) and the Compose plugin.

```bash
git clone <this repo> && cd <repo>
cp mongodb/.env.example mongodb/.env && nano mongodb/.env   # strong, unique passwords
sudo systemctl enable docker                                 # start Docker on boot
docker compose -f mongodb/docker-compose.yml up -d --wait    # restart: unless-stopped keeps it running
```

Then point the API server at it in `.env.local` (or your process manager's environment):

- **App on the same server** (simplest and most secure): keep
  `MONGO_BIND_IP=127.0.0.1` and use `127.0.0.1` in `MONGODB_URI`.
- **App on a different server**: set `MONGO_BIND_IP` to the database server's
  **private** IP (e.g. `10.0.0.5`), restart, and use that IP in `MONGODB_URI`.
  Allow port 27017 **only from the app server** using your cloud provider's
  firewall or security group.
  - Docker writes its own iptables rules, so **`ufw` does not filter published
    container ports**. That is why the bind IP matters. Never set
    `MONGO_BIND_IP=0.0.0.0` on a machine with a public IP.
  - If traffic crosses a network you don't control, enable TLS on `mongod` or
    connect through a VPN or SSH tunnel.

On every production deploy of the app, build the indexes once (production
does not auto-build them):

```bash
NODE_ENV=production pnpm db:indexes
```

---

## 3. Native install (no Docker)

These steps are for **Ubuntu 24.04**. For other distributions, follow the
[official install guide](https://www.mongodb.com/docs/manual/administration/install-on-linux/)
and continue from step 3.

```bash
# 1. Install MongoDB Community 8.0
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt-get update && sudo apt-get install -y mongodb-org

# 2. Use this project's config (login required, localhost only), then start on boot
sudo cp mongodb/mongod.conf /etc/mongod.conf
sudo systemctl enable --now mongod

# 3. Create the admin user. MongoDB allows this once, from the server itself,
#    while no users exist (the "localhost exception").
mongosh admin --eval 'db.createUser({ user: "dsw_admin", pwd: passwordPrompt(), roles: ["root"] })'

# 4. Create the app user (you will be asked for the admin password)
MONGO_APP_DB=digital_skills_wallet MONGO_APP_USERNAME=dsw_app MONGO_APP_PASSWORD='<app password>' \
  mongosh "mongodb://dsw_admin@127.0.0.1:27017/admin" mongodb/init/01-create-app-user.js
```

The `MONGODB_URI` format is the same as for Docker. To accept connections from
a separate app server, add the server's private IP to `net.bindIp` in
`/etc/mongod.conf` (e.g. `127.0.0.1,10.0.0.5`), allow port 27017 from the app
server only in the firewall, and restart with `sudo systemctl restart mongod`.

Backups on a native install:
`mongodump --uri "mongodb://dsw_admin@127.0.0.1:27017/?authSource=admin" --db digital_skills_wallet --archive=backup.archive.gz --gzip`

---

## Everyday commands (Docker)

| Command | What it does |
| --- | --- |
| `pnpm db:up` | Start MongoDB and wait until it is healthy |
| `pnpm db:down` | Stop MongoDB. Data is kept in the `mongo-data` volume |
| `pnpm db:logs` | Follow the server logs |
| `pnpm db:shell` | Open `mongosh` as the app user |
| `pnpm db:seed` | Load demo data into an empty database (`pnpm db:seed --reset` wipes it first) |
| `pnpm db:indexes` | Create or refresh indexes to match the schemas |
| `pnpm db:backup` | Write a gzipped backup to `mongodb/backups/` |

`docker compose -f mongodb/docker-compose.yml down -v` **deletes all data**.

## Backups

```bash
./mongodb/backup.sh                    # -> mongodb/backups/dsw-<timestamp>.archive.gz
./mongodb/backup.sh /srv/backups       # custom folder
./mongodb/restore.sh <file.archive.gz> # replaces the current database (asks first)
```

On a server, schedule `backup.sh` with cron (an example is at the top of the
script), copy the archives to another machine, and test a restore now and then.

## Security checklist

- [x] Login required. The app uses a `readWrite` user limited to one database. Root is for maintenance only.
- [x] The server listens on `127.0.0.1` by default. Port 27017 is never public.
- [x] Real `.env` files are gitignored. Only the `.env.example` templates are committed.
- [x] Secrets stay out of the data: passwords are scrypt-hashed, verification links are stored as SHA-256 hashes, and `passwordHash`, 2FA secrets and answer keys are hidden from queries by default.
- [x] Audit log entries are hash-chained, so tampering is detectable (`verifyAuditChain()`).
- [ ] Use long random passwords. Hex passwords need no URL-encoding in `MONGODB_URI`.
- [ ] Enable TLS (or use a VPN or SSH tunnel) if the app and database talk over an untrusted network.
- [ ] Schedule backups and keep copies off the server.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `MONGODB_URI is not set` | Create `.env.local` from `.env.example` |
| `ECONNREFUSED 127.0.0.1:27017` | The server isn't running (`pnpm db:up`), or the host or port in `MONGODB_URI` is wrong |
| `Authentication failed` | The password in `MONGODB_URI` doesn't match `MONGO_APP_PASSWORD`, or `authSource` is missing. Remember the accounts are only created on the first start (see the next row) |
| Changed passwords in `mongodb/.env` but the old ones still work | Change them in MongoDB: run `docker compose -f mongodb/docker-compose.yml exec mongodb mongosh -u <root user> -p --authenticationDatabase admin`, then `db.getSiblingDB("digital_skills_wallet").changeUserPassword("dsw_app", "<new>")` |
| Port 27017 already in use | Set `MONGO_PORT=27018` in `mongodb/.env` and update `MONGODB_URI` |
