# 01 — Get the code and install what the project needs

Assumes a server that is already set up and serving other projects (Ubuntu 22.04 with sudo, git, internet access). Nothing here touches the
firewall, users, reverse proxy, tunnel or systemd — how port 8080 reaches the internet and how the start command runs at boot is your own setup.

Do **Step 1** for both paths, then **either 2a (Docker)** or **2b (Node + Postgres + Timescale + Redis)**.

## 1. Clone the repository

The repo root contains the old Laravel app, the migration notes (`migration/`) and the new backend (`node-backend/`). **Everything below happens
inside `node-backend/`.** Nothing here modifies the Laravel files.

```bash
git clone <YOUR-REPO-URL> convoyai
cd convoyai
git checkout rewrite/node-stack       # the Node rewrite lives on this branch until it is merged
cd node-backend
```

---

## 2a. Path A — Docker (recommended): install Docker only

The compose file brings its own PostgreSQL + TimescaleDB and Redis, so Docker is the only thing to install. Skip if `docker compose version` already works.

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"       # then log out/in (or `newgrp docker`) so `docker` works without sudo
docker compose version
```

Next: [02-environment-variables.md](02-environment-variables.md), then [04-path-a-docker.md](04-path-a-docker.md).

---

## 2b. Path B — Node 22, PostgreSQL 16 + TimescaleDB, Redis

### Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs build-essential python3    # build tools only matter if a native module has to compile
node -v                                                # must print v22.x  (package.json allows ">=22 <25")
```

The project's own packages (including `pm2`) are installed by the deploy script (`npm ci`) — nothing else is installed globally.

### PostgreSQL 16 + the TimescaleDB extension

The extension is **required** (`device_values` becomes a hypertable). Development version: `timescale/timescaledb:2.17.2-pg16`.

```bash
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y

echo "deb https://packagecloud.io/timescale/timescaledb/ubuntu/ $(lsb_release -c -s) main" | sudo tee /etc/apt/sources.list.d/timescaledb.list
wget --quiet -O - https://packagecloud.io/timescale/timescaledb/gpgkey | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/timescaledb.gpg
sudo apt update
sudo apt install -y postgresql-16 timescaledb-2-postgresql-16 postgresql-client-16

sudo timescaledb-tune --quick --yes        # adds timescaledb to shared_preload_libraries
sudo systemctl restart postgresql
```

Create the database and user (letters+digits password — it goes into a URL):

```bash
DBPASS=$(openssl rand -hex 16); echo "$DBPASS"      # you need this for DATABASE_URL
sudo -u postgres psql <<SQL
CREATE USER convoyai WITH PASSWORD '$DBPASS';
CREATE DATABASE convoyai OWNER convoyai;
SQL
# the extension needs a superuser, and the app's bootstrap deliberately does not install it:
sudo -u postgres psql -d convoyai -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"
sudo -u postgres psql -d convoyai -c "\dx"          # timescaledb must be listed
```

`DATABASE_URL=postgresql://convoyai:<DBPASS>@localhost:5432/convoyai?schema=public`

> If another project on this server already uses PostgreSQL 16, add a **separate database and user** as above; the Timescale extension is per database.
> If it already runs a different PostgreSQL major version or another Redis on the default ports, use different ports for this project (`DATABASE_URL`/`REDIS_URL` accept any port).

### Redis 7

```bash
sudo apt install -y redis-server
sudo sed -i 's/^# *maxmemory-policy.*/maxmemory-policy noeviction/' /etc/redis/redis.conf    # BullMQ requires noeviction
sudo systemctl restart redis-server && redis-cli ping                                        # PONG
```

`REDIS_URL=redis://localhost:6379` (with a password: `redis://:PASSWORD@localhost:6379`).

> Persistence: the Docker compose Redis runs without persistence (`--save "" --appendonly no`), so queued jobs (unsent e-mails, pending rule actions) are lost on a Redis
> restart. Acceptable for staging; for production turn on AOF (`appendonly yes` in `redis.conf`, or edit the `redis` service `command:` in the compose file).

Next: [02-environment-variables.md](02-environment-variables.md), then [05-path-b-pm2.md](05-path-b-pm2.md).

---

## What listens where (for whoever wires up the tunnel)

Only the `http` process needs to be reachable from outside: **`localhost:8080`** serves the REST API **and** Socket.IO (WebSocket upgrade on the same port and the
`/socket.io` path). Uploads up to 10 MB are accepted, so the front door must allow request bodies of at least that size. Postgres and Redis stay internal.
