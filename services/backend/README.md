# Backend Service

This is the FastAPI backend for Bowling Bowl Grid.
It provides APIs for balls, arsenals, recommendations, slots, gaps, degradation, and oil patterns.

Why this file exists:

- Give backend-only setup and run steps in one place.
- Reduce context switching for backend contributors.
- Point to deeper docs when details are needed.

How to use this file:

- Follow the quickstart to run backend + DB locally.
- Use the command reference for common tasks.
- Use linked docs for API and data details.

## Prerequisites

- Python 3.10+
- Docker (for local Postgres)
- Git

## Quickstart (local backend development)

1. Create and activate virtual environment:

```bash
cd services/backend
python -m venv .venv
source .venv/bin/activate
```

2. Install dependencies:

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

3. Create environment file at repo root:

```bash
cd ../..
cp .env.template .env
```

Set at least:

- `POSTGRES_PASSWORD`
- `DATABASE_URL` (match password above)
- `APP_ENV=development` for local work
- `ADMIN_KEY` only if using admin endpoints

4. Start Postgres (DB only):

```bash
docker compose up -d postgres
```

5. Bootstrap schema and data (from repo root):

```bash
python services/backend/scripts/setup_db.py
```

6. Run backend:

```bash
cd services/backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Open API docs at `http://localhost:8000/docs`.

## Environment and config notes

- `DATABASE_URL` is required. Backend fails to start without it.
- Backend reads env values in this order:
  1. process environment
  2. `services/backend/.env`
  3. repo-root `.env`
- If backend runs inside Compose, use host `postgres` in `DATABASE_URL`.
- If backend runs on your machine, use `localhost` (or `127.0.0.1`) with the DB port exposed.

## Database bootstrap order

If running scripts manually, keep this order:

```bash
python services/backend/scripts/seed_from_csv.py
python services/backend/scripts/migrate_arsenals.py
python services/backend/scripts/train_model.py
python services/backend/scripts/migrate_oil_patterns.py
```

Why order matters:

- `arsenal_balls` references `balls`, so `seed_from_csv.py` must run first.

## Common commands

From repo root unless noted:

- Run unit tests only:
  ```bash
  cd services/backend && python -m pytest tests/ -m "not integration" -v
  ```
- Run integration tests only:
  ```bash
  cd services/backend && python -m pytest tests/ -m "integration" -v
  ```
- Run all backend tests:
  ```bash
  cd services/backend && python -m pytest tests/ -v
  ```
- Seed catalog data:
  ```bash
  python services/backend/scripts/seed_from_csv.py
  ```
- Create arsenal tables:
  ```bash
  python services/backend/scripts/migrate_arsenals.py
  ```

## Links

- Backend API and module details: `../../docs/backend.md`
- Data schema and seed flow: `../../docs/data-collection.md`
- Troubleshooting runbook: `../../docs/troubleshooting.md`
- Contribution workflow: `../../CONTRIBUTING.md`
- Backend test notes: `tests/README.md`
