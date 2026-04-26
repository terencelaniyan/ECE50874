# Bowling Bowl Grid – ECE 50874 Project

### What this is

This repository contains the code for the **Bowling Bowl Grid** project for **ECE 595/50874 Engineering Track**.

The system is organized into:

- `services/backend/`: FastAPI backend that exposes HTTP APIs, talks to PostgreSQL, and implements arsenal management (catalog + custom balls), gap/degradation, and recommendation logic.
- `services/frontend/`: React + TypeScript + Vite SPA for interacting with the backend (see that directory for details).
- `data/`: Data assets and experiment outputs (often git-ignored in practice).
- `docs/`: Project documentation (API, frontend, data pipeline, recommendations, deployment, testing, simulation validation, course deliverables).
- `docker-compose.yml`: Compose stack (PostgreSQL, FastAPI backend, nginx-served SPA, Caddy). For host-run backend/frontend you often start **only** Postgres, e.g. `docker compose up -d postgres`.

You can run the backend against a local PostgreSQL database (via Docker) and use the included UI under `services/frontend/`.

---

## Project structure

High-level layout:

- `services/backend/`
  - `app/`
    - `main.py` – FastAPI application (`app`) exposing the HTTP API.
    - `api_models.py` – Pydantic models for requests/responses.
    - `config.py` – Configuration and environment handling.
    - `db.py` – PostgreSQL connection helper(s).
    - `degradation.py` – Degradation modeling logic for bowling balls.
    - `gap_engine.py` – Gap computation over the catalog/arsenal.
    - `recommendation_engine.py` – Recommendation logic on top of ball catalog and arsenal.
    - `services.py` – Service layer used by routes (arsenals with custom-ball support, gaps, recommendations v1/v2, slots, degradation, oil patterns, admin).
    - `slot_assignment.py` – 6-ball slot clustering / silhouette.
    - `two_tower.py` – Two-tower model (**PyTorch**).
    - `synthetic_data.py` – Synthetic arsenal data for training.
    - `exceptions.py` – HTTP-facing errors.
  - `requirements.txt` – Python backend dependencies (see [docs/TECH_DEBT.md](docs/TECH_DEBT.md): **PyTorch** is not pinned; needed for two-tower training).
  - `scripts/` – Backend-related helper scripts.
  - `tests/` – Backend tests.
- `services/frontend/` – React + TypeScript + Vite SPA (see that directory for details).
- `data/` – Input data, processed artifacts, and experiment outputs.
- `docs/`
  - `backend.md` – Backend architecture and API details.
  - `frontend.md` – Frontend architecture, structure, and usage.
  - `data-collection.md` – Data collection pipeline and formats.
  - `recommendation-engine.md` – Recommendation engine design and math.
  - `deploy.md` – Production single-server deploy (.env, Caddy, seeding).
  - `E2E_TEST_PLAN.md` – End-to-end test plan.
  - `PHASE1_IMPLEMENTATION_GUIDE.md` – Phase 1 (physics / simulation) implementation guide.
  - `PROJECT_STATUS.md` – Reconciled feature status, backlog, and testing overview.
  - `TECH_DEBT.md` – Open shortcuts and their cost (see `PROJECT_STATUS.md` for status).
  - `simulation/` – Simulation validation notes (physics audit, USBC specs, test matrix, deflection analysis).
  - Course HTML exports in `docs/` (e.g. project report pages) as needed for submission.
- `docker-compose.yml` – Postgres, backend, frontend, Caddy (see file).

For deeper technical details, start with the documents under `docs/`. With the backend running, the interactive OpenAPI UI is at `http://localhost:8000/docs` (see **Backend – local development** below).

**Production (single-server):** See [docs/deploy.md](docs/deploy.md) for .env checklist, Caddyfile domain, and the one-off seed command.

---

## Prerequisites

To run the backend locally:

- **Python**: 3.10+ recommended
- **PostgreSQL**: via Docker (using `docker-compose.yml`) or your own instance
- **Git**

To work on the React + Vite frontend under `services/frontend/`, you will typically need:

- **Node.js** (LTS) and **npm** or **yarn**

---

## Backend – local development

Backend code lives under `services/backend/`.

### 1. Create and activate a virtual environment

From the repo root:

```bash
cd services/backend

python -m venv .venv
source .venv/bin/activate  # macOS/Linux
# .venv\Scripts\activate   # Windows PowerShell
```

### 2. Install dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Configure environment

**Where settings are read:** the backend loads `DATABASE_URL` and related variables in this order (see `services/backend/app/config.py`):

1. Process environment (e.g. variables injected by Docker Compose).
2. `services/backend/.env`
3. Repository root `.env` (next to `docker-compose.yml`)

For local development you can use either (2) or (3). **Docker Compose** reads a `.env` file at the **repository root** for substitutions in `docker-compose.yml` (`POSTGRES_PASSWORD`, `DATABASE_URL`, `APP_ENV`, `ADMIN_KEY`), so keep a root `.env` when using Compose.

**First-time setup:** copy [.env.template](.env.template) to `.env` at the repo root, set real values, and do not commit `.env`. Use a `DATABASE_URL` whose password matches `POSTGRES_PASSWORD`. For production deployment, see [docs/deploy.md](docs/deploy.md).

**`DATABASE_URL` depends on how the backend runs:**

- **Backend in Compose:** use hostname `postgres` (the DB service name), e.g. `postgresql://postgres:YOUR_PASSWORD@postgres:5432/bowlingdb`, with `YOUR_PASSWORD` equal to `POSTGRES_PASSWORD`.
- **Backend on your machine** (`uvicorn` on the host): use `localhost` (or `127.0.0.1`) and a port where PostgreSQL is reachable. The default `docker-compose.yml` does **not** publish Postgres on the host; add `docker-compose.override.yml` with `ports: ["5433:5432"]` on `postgres` and point `DATABASE_URL` at `@localhost:5433/...` if you want the DB only in Docker while running scripts or uvicorn locally.

Example when Postgres is available on the host at port 5432 (your own install or a published port):

```bash
APP_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bowlingdb
```

Adjust user, password, host, and port to match your database.

### 4. Start PostgreSQL via Docker (recommended)

Before `docker compose up`, ensure the **repo root** `.env` defines at least `POSTGRES_PASSWORD` and a `DATABASE_URL` the backend container can use (hostname `postgres`, same password). Set `ADMIN_KEY` if you use admin-only API routes from the containerized backend.

From the repo root:

```bash
docker compose up -d
```

This starts **all** services in the file (Postgres, backend on 8000, frontend on 3000, Caddy on 80/443). Postgres uses database `bowlingdb` / user `postgres` per compose env. The default compose does not expose Postgres on the host. For **DB only**: `docker compose up -d postgres`. For local development with host access to Postgres (e.g. running migrations from your machine), add a `docker-compose.override.yml` that sets `ports: ["5433:5432"]` on the postgres service and use `DATABASE_URL=...@localhost:5433/...` in your `.env`.

You can stop it later with:

```bash
docker compose down
```

### 5. Apply database schema

**One-shot (recommended):** from the repo root, with `DATABASE_URL` set:

```bash
python services/backend/scripts/setup_db.py
```

This runs **in order**: (1) `seed_from_csv.py` — `balls` from `data/balls.csv`; (2) `migrate_arsenals.py` — arsenals tables; (3) `train_model.py` — two-tower training and `models/two_tower.pt`. Step (3) expects **PyTorch** installed in your environment (`torch` is not in `requirements.txt` by default; install separately or see [docs/TECH_DEBT.md](docs/TECH_DEBT.md)).

**Manual same order** (wrong order fails because `arsenal_balls` references `balls`):

```bash
python services/backend/scripts/seed_from_csv.py
python services/backend/scripts/migrate_arsenals.py
python services/backend/scripts/train_model.py
```

**Oil patterns:** not run by `setup_db.py`. For DB-backed `oil_patterns` used by `GET /oil-patterns`:

```bash
python services/backend/scripts/migrate_oil_patterns.py
```

Details: [docs/data-collection.md](docs/data-collection.md).

### 6. Run the backend server

With the virtual environment active and Postgres running:

```bash
cd services/backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Then open:

- API docs: `http://localhost:8000/docs`
- OpenAPI JSON: `http://localhost:8000/openapi.json`

---

## Frontend – local development

The frontend is a React + TypeScript SPA built with Vite. Tabs include **Grid** (Voronoi + recs/slots), **Catalog**, **Simulation** (2D), **3D Sim** (Rapier/Three.js), **Analysis** (video / pose / kinematics), and **Ball Database**. Recommendations and gaps also have dedicated panel components in code, but the main nav is the list above; ranked recs and slot assignment live on **Grid** via the Recs / Slots toggle. It talks to the backend for balls, arsenals (including optional custom balls), recommendations (v1/v2), slots, degradation compare, gaps, and oil patterns. See [docs/frontend.md](docs/frontend.md).

**Prerequisites:** Node.js (LTS) and npm.

From the repo root:

```bash
cd services/frontend
npm install
npm run dev
```

Then open `http://localhost:5173`. The Vite dev server proxies `/api` to `http://localhost:8000`, so the backend must be running (see above). To use a different API URL, set `VITE_API_BASE` (e.g. `VITE_API_BASE=http://localhost:8000`).

**Build for production:**

```bash
npm run build
```

Output is in `dist/`. With Docker Compose, the frontend is built and served (e.g. via nginx). In that setup, the browser uses `/api`, which nginx proxies to the backend service at `http://backend:8000/`. Ensure the backend is reachable at that host in production.

**Run frontend tests:**

```bash
cd services/frontend
npm run test:run
```

Or `npm test` for watch mode.

**End-to-end (Playwright):** requires seeded DB + backend on 8000 + Vite on 5173. From `services/frontend/`:

```bash
npm run test:e2e
npm run test:e2e:ui
```

See [docs/E2E_TEST_PLAN.md](docs/E2E_TEST_PLAN.md).

---

## Data and experiments

The `data/` directory is intended for:

- Raw data used by the backend or experiments.
- Processed datasets and feature tables.
- Model outputs and evaluation results.

Refer to:

- `docs/data-collection.md` – how data is collected, cleaned, and stored.
- `docs/recommendation-engine.md` – how data feeds into the recommendation engine.
- `docs/backend.md` – backend endpoints that read/write data.
- `docs/frontend.md` – frontend structure, data flow, and usage.
- `docs/deploy.md` – production deployment.
- `docs/E2E_TEST_PLAN.md` – Playwright E2E layout, how to run, backlog.
- `docs/PHASE1_IMPLEMENTATION_GUIDE.md` – Phase 1 simulation guide.
- `docs/PROJECT_STATUS.md` – project status and backlog.
- `docs/TECH_DEBT.md` – technical debt (shortcuts and cost).
- `docs/simulation/` – simulation validation and analysis notes.

Large or sensitive files should **not** be committed to Git. Use `.gitignore` to exclude them.

---

## Testing

Backend tests live under `services/backend/tests/`.

From `services/backend/` with the virtual environment active:

```bash
pytest
```

You can run a specific test file or subset with:

```bash
pytest tests/test_gap_engine.py
pytest tests/test_recommendation_engine.py -k "some_test_name"
```

Frontend tests (Vitest): from `services/frontend/`, run `npm run test:run` or `npm test` (watch mode). Playwright: `npm run test:e2e` (see [docs/E2E_TEST_PLAN.md](docs/E2E_TEST_PLAN.md)).

**CI:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on push and pull requests to `main` and `master` (and on manual dispatch). It has three jobs: **backend** (Postgres service + seed + unit and integration pytest phases), **frontend** (Vitest coverage), and **e2e** (Postgres + backend startup + Playwright `npm run test:e2e` + Playwright report artifact upload).

---

## Development workflow

1. **Clone the repo**

   ```bash
   git clone https://github.com/terencelaniyan/ECE50874.git
   cd ECE50874
   ```

2. **Configure env and start PostgreSQL**
   - Copy `.env.template` to `.env` at the repo root and set `POSTGRES_PASSWORD`, `DATABASE_URL`, and other values (see **Backend – §3** and **§4**).
   - Start services (or DB only):

   ```bash
   docker compose up -d
   ```

3. **Set up the backend**
   - Create and activate a virtual environment under `services/backend/`.
   - Install dependencies with `pip install -r requirements.txt`.
   - Ensure a `.env` file (repo root and/or `services/backend/`) provides `DATABASE_URL` and other settings for **host-run** uvicorn (see **§3**).
   - Apply the database schema (`python services/backend/scripts/setup_db.py`, or `seed_from_csv.py` then `migrate_arsenals.py` manually; `migrate_oil_patterns.py`; see §5 above).
   - Run `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`.

4. **Set up the frontend**
   - The project includes a React + TypeScript + Vite app under `services/frontend/`.
   - Install dependencies (`npm install`) and run the dev server (`npm run dev`).

5. **Run tests**
   - Backend: `pytest` from `services/backend/`.
   - Frontend: `npm run test:run` or `npm test` (watch) from `services/frontend/`; E2E: `npm run test:e2e` when API + DB are up.

---

## Additional documentation

For deeper details, see:

- `docs/backend.md` – backend modules, routing, and configuration.
- `docs/frontend.md` – frontend architecture, structure, and usage.
- `docs/data-collection.md` – data sources, schemas, and pipelines.
- `docs/recommendation-engine.md` – algorithms, metrics, and implementation notes.
- `docs/deploy.md` – production deployment.
- `docs/E2E_TEST_PLAN.md` – E2E testing.
- `docs/PHASE1_IMPLEMENTATION_GUIDE.md` – Phase 1 simulation guide.
- `docs/PROJECT_STATUS.md` – project status and backlog.
- `docs/TECH_DEBT.md` – technical debt (shortcuts and cost).
- `docs/simulation/` – simulation validation and analysis notes.

Keep this `README.md` and the `docs/` folder up to date as the project evolves.
