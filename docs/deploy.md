# Single-server production deployment

## Before you start

1. **Secrets in `.env`** (do not commit):
   - Copy `.env.template` to `.env` at the repo root.
   - Set strong values for `POSTGRES_PASSWORD`, `DATABASE_URL` (use the same password in the URL: `postgresql://postgres:YOUR_PASSWORD@postgres:5432/bowlingdb`), and `ADMIN_KEY`.
   - Set `APP_ENV=production`. Optionally set `ALLOWED_ORIGIN` to your production domain (e.g. `https://yourdomain.com`).

2. **Caddyfile**:
   - Replace `yourdomain.com` in the Caddyfile with your actual domain.
   - Caddy will obtain a Let's Encrypt certificate automatically; port 80 must be reachable for ACME.

3. **Ports**: Ensure host ports 80 and 443 are free for Caddy.

## Deploy

From the repo root:

```bash
docker compose up --build
```

## Seed the database (first time only)

The backend image does not include `scripts/` or `data/`. Run this one-off command from the repo root after the stack is up:

```bash
docker compose run --rm -v "$(pwd):/repo" -w /repo --env-file .env backend python /repo/services/backend/scripts/setup_db.py
```

This mounts the repo so `data/balls.csv` and the scripts are available and uses `.env` for `DATABASE_URL`.

## Catalog refresh

In-container catalog refresh (`POST /admin/refresh-catalog`) is not supported in the default image (no scripts or data inside the container). To refresh the catalog, re-run the one-off seed command above with the repo mounted.

## Checklist

- Strong passwords in `.env`; no secrets in `docker-compose.yml`.
- `.env` in `.gitignore` (already).
- Caddy added; Caddyfile domain set; 80/443 reachable for TLS.
- CORS locked to production domain via `APP_ENV` (and optional `ALLOWED_ORIGIN`).
- Admin endpoint protected with `ADMIN_KEY` and `X-Admin-Key` header.
- Postgres port not exposed in main compose.
- `docker compose up --build`.
- Run the one-off seed command once (mount repo + `--env-file .env`).
