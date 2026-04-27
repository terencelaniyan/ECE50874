# Troubleshooting

This runbook helps you resolve common local development and CI-like failures quickly.

Why this exists:
- Repeated setup issues should have a single, command-first reference.
- Faster recovery means less time debugging environment drift.

How to use it:
1. Find the symptom that matches your error.
2. Check the likely cause.
3. Run the fix commands in order.

## 1) Backend cannot connect to Postgres

Symptom:
- Backend startup fails.
- `/health` fails.
- Errors mention connection refused, DNS failure for `postgres`, or auth failure.

Likely causes:
- Postgres container not running.
- Wrong hostname for your runtime context.
- `DATABASE_URL` password does not match `POSTGRES_PASSWORD`.

Fix:

```bash
# from repo root
docker compose ps
docker compose up -d postgres
```

Check URL context:
- Host-run `uvicorn`: use `localhost` (or `127.0.0.1`) and exposed DB port.
- Compose-run backend: use `postgres` host in `DATABASE_URL`.

If needed, reset URL in `.env`:

```bash
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@postgres:5432/bowlingdb
```

Then restart backend.

## 2) Frontend cannot reach API

Symptom:
- Frontend loads but data requests fail.
- Browser/network shows 404 or connection errors for `/api/*`.

Likely causes:
- Backend is not running on port 8000.
- `VITE_API_BASE` points to wrong origin.
- Vite dev proxy is bypassed unexpectedly.

Fix:

```bash
# terminal 1
cd services/backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# terminal 2
cd services/frontend
npm run dev
```

For standard local development, do not override `VITE_API_BASE`; let `/api` proxy to `http://localhost:8000`.

If you explicitly set `VITE_API_BASE`, verify it points to a live backend.

## 3) Seed/migration order errors

Symptom:
- Migration fails around foreign keys (`arsenal_balls` -> `balls`).
- Recommendation/gap endpoints fail due to missing base tables/data.

Likely causes:
- `migrate_arsenals.py` ran before `seed_from_csv.py`.
- Seed scripts were not run in current database.

Fix:

```bash
# preferred one-shot from repo root
python services/backend/scripts/setup_db.py
```

Manual order when needed:

```bash
python services/backend/scripts/seed_from_csv.py
python services/backend/scripts/migrate_arsenals.py
python services/backend/scripts/train_model.py
python services/backend/scripts/migrate_oil_patterns.py
```

## 4) Integration tests are skipped or failing unexpectedly

Symptom:
- Integration tests are skipped locally.
- Integration tests fail with DB-related errors.

Likely causes:
- `DATABASE_URL` missing in environment.
- Postgres not running or not seeded.
- Local DB state differs from expected baseline.

Fix:

```bash
# from repo root
docker compose up -d postgres
python services/backend/scripts/seed_from_csv.py
python services/backend/scripts/migrate_arsenals.py

# run integration tests
cd services/backend
python -m pytest tests/ -m "integration" -v
```

## 5) Playwright E2E failures due to missing app state

Symptom:
- `npm run test:e2e` or `npm run test:e2e:smoke` fails early.
- Errors indicate backend unavailable or missing data.

Likely causes:
- Backend not running on 8000.
- DB not seeded with required tables/data.
- Frontend dev server not accessible for tests.

Fix:

```bash
# terminal 1: DB
docker compose up -d postgres
python services/backend/scripts/seed_from_csv.py
python services/backend/scripts/migrate_arsenals.py

# terminal 2: backend
cd services/backend
uvicorn app.main:app --host 0.0.0.0 --port 8000

# terminal 3: e2e
cd services/frontend
npm run test:e2e:smoke
# or full suite
# npm run test:e2e
```

## 6) Port conflicts (8000, 5173, 5432)

Symptom:
- Startup errors mention address already in use.

Likely causes:
- Another local process already uses the port.

Fix:

```bash
lsof -i :8000
lsof -i :5173
lsof -i :5432
```

Stop conflicting processes, or run services on alternate ports and update config accordingly.

## 7) Admin endpoints return 403

Symptom:
- `POST /admin/*` responds with 403.

Likely causes:
- `ADMIN_KEY` missing/empty.
- Request missing `X-Admin-Key` header or header value mismatch.

Fix:

1. Set `ADMIN_KEY` in `.env`.
2. Restart backend.
3. Send header exactly:

```text
X-Admin-Key: <your ADMIN_KEY value>
```

## Related docs

- Root setup flow: `../README.md`
- Backend detail: `backend.md`
- Frontend detail: `frontend.md`
- Deployment: `deploy.md`
- Data/seed details: `data-collection.md`
