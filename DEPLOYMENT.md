# Deployment (Hetzner)

This stack runs on a single Hetzner CX22 (or larger) VPS via Docker Compose:
- **app** — Next.js (production build, standalone output)
- **pdf-service** — Python/FastAPI + PyMuPDF
- **caddy** — TLS reverse proxy with auto-renewing Let's Encrypt cert

The database is **Neon** (managed Postgres). Files are stored on a Docker volume.

## Prerequisites

- A Hetzner VPS running Ubuntu 22.04+ (CX22 = 4GB RAM is the minimum recommended)
- A registered domain pointing at the VPS public IP (A record)
- A Neon Postgres database (free tier is fine for the MVP)
- Anthropic API key + OpenAI API key

## One-time server setup

```bash
ssh root@<vps-ip>

# Install Docker
apt update && apt install -y docker.io docker-compose-plugin git
systemctl enable --now docker

# Open ports
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```

## Deploy

```bash
git clone <repo-url> /opt/tenderim
cd /opt/tenderim

cp .env.example .env
# Edit .env — fill in DATABASE_URL (Neon), DOMAIN, NEXTAUTH_URL, NEXTAUTH_SECRET,
# ANTHROPIC_API_KEY, OPENAI_API_KEY

# Generate a NextAuth secret if needed:
# openssl rand -base64 32

# First-time DB schema push (run against Neon):
docker run --rm --env-file .env node:22-alpine sh -c "
  cd /tmp && git clone /opt/tenderim app && cd app && \
  npm ci && npx prisma db push
"
# Or run `npx prisma db push` from your dev machine with the same DATABASE_URL.

docker compose up -d --build
```

Caddy will automatically obtain a Let's Encrypt cert for `$DOMAIN` on first request.

## Verifying

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f pdf-service
```

Visit `https://<your-domain>/register` to create the first account.

## Updating

```bash
cd /opt/tenderim
git pull
docker compose up -d --build
```

If the schema changed:

```bash
# From your dev machine, against the production DATABASE_URL:
npx prisma db push
```

## Operational notes

- **File storage**: tender files live in the `tender_data` Docker volume mounted at `/data` inside the app container. Back this up regularly (`docker run --rm -v tenderim_tender_data:/data -v $PWD:/backup alpine tar czf /backup/tender_data.tgz -C /data .`).
- **Job queue**: pg-boss creates a `pgboss` schema in your Neon DB on first start. Workers run inside the app container via Next.js `instrumentation.ts`. Restarting the app restarts the workers.
- **PDF service**: not exposed on the host network. Only `app` can reach it via the docker bridge at `pdf-service:8000`.
- **Logs**: `docker compose logs -f` for live tailing. For long-term retention, configure Docker's `json-file` log driver with size caps or ship to an external service.
- **Resource sizing**: extraction passes use Claude vision per page, so peak RAM in the app container during a large tender (~200 pages) stays modest (~600MB). pdf-service stays under 300MB. CX22 (4GB) handles a single user comfortably; for multiple concurrent extractions, bump to CX32 (8GB).

## Rollback

```bash
cd /opt/tenderim
git checkout <previous-commit>
docker compose up -d --build
```

The DB schema is not auto-rolled-back. If a schema change is incompatible, restore from a Neon point-in-time backup or revert manually.
