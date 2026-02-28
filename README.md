Bowling Bowl Grid – ECE 50874 Project
=====================================

### What this is

This repository contains the code for the **Bowling Bowl Grid** project for **ECE 595/50874 Engineering Track**.

The system is organized into:

- `services/backend/`: FastAPI backend that exposes HTTP APIs, talks to PostgreSQL, and implements the gap/degradation and recommendation logic.
- `services/frontend/`: Frontend application for interacting with the backend (framework-agnostic in this repo; see that directory for details).
- `data/`: Data assets and experiment outputs (often git-ignored in practice).
- `docs/`: Project documentation (backend architecture, data collection, recommendation engine).
- `docker-compose.yml`: Local PostgreSQL instance used by the backend.

You can run the backend against a local PostgreSQL database (via Docker) and connect any frontend you build under `frontend/`.

---

Project structure
-----------------

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
  - `requirements.txt` – Python backend dependencies.
  - `scripts/` – Backend-related helper scripts (if present).
  - `tests/` – Backend tests (if present).
- `services/frontend/` – Frontend code (JS/TS, other framework, or placeholder; see directory for specifics).
- `data/` – Input data, processed artifacts, and experiment outputs.
- `docs/`
  - `backend.md` – Backend architecture and API details.
  - `data-collection.md` – Data collection pipeline and formats.
  - `recommendation-engine.md` – Recommendation engine design and math.
- `docker-compose.yml` – Local PostgreSQL service definition.

For deeper technical details, start with the documents under `docs/`.

---

Prerequisites
-------------

To run the backend locally:

- **Python**: 3.10+ recommended
- **PostgreSQL**: via Docker (using `docker-compose.yml`) or your own instance
- **Git**

If you have a JavaScript/TypeScript frontend under `services/frontend/`, you will typically also need:

- **Node.js** (LTS) and **npm** or **yarn**

Adjust the frontend instructions below to match your chosen framework and tooling.

---

Backend – local development
---------------------------

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

Create a `.env` file in `services/backend/` (or wherever `config.py` expects it). At minimum, define:

```bash
APP_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bowlingdb
```

The example URL matches the credentials and database name from `docker-compose.yml`. If you use a different Postgres setup, update `DATABASE_URL` accordingly.

### 4. Start PostgreSQL via Docker (recommended)

From the repo root:

```bash
docker compose up -d
```

This will start a local Postgres 16 instance named `bowlingdb` with:

- user: `postgres`
- password: `postgres`
- database: `bowlingdb`
- port: `5432` on your host

You can stop it later with:

```bash
docker compose down
```

### 5. Run the backend server

With the virtual environment active and Postgres running:

```bash
cd services/backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Then open:

- API docs: `http://localhost:8000/docs`
- OpenAPI JSON: `http://localhost:8000/openapi.json`

---

Frontend – local development
---------------------------

The frontend is a React + TypeScript SPA built with Vite. It talks to the backend for balls, arsenals, recommendations, and gap analysis.

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

---

Data and experiments
--------------------

The `data/` directory is intended for:

- Raw data used by the backend or experiments.
- Processed datasets and feature tables.
- Model outputs and evaluation results.

Refer to:

- `docs/data-collection.md` – how data is collected, cleaned, and stored.
- `docs/recommendation-engine.md` – how data feeds into the recommendation engine.
- `docs/backend.md` – backend endpoints that read/write data.

Large or sensitive files should **not** be committed to Git. Use `.gitignore` to exclude them.

---

Testing
-------

Backend tests (if present) live under `services/backend/tests/`.

From `services/backend/` with the virtual environment active:

```bash
pytest
```

You can run a specific test file or subset with:

```bash
pytest tests/test_gap_engine.py
pytest tests/test_recommendation_engine.py -k "some_test_name"
```

Frontend tests (Vitest): from `services/frontend/`, run `npm run test:run` or `npm test` (watch mode).

---

Development workflow
--------------------

1. **Clone the repo**

   ```bash
   git clone <YOUR_REPO_URL>
   cd ECE50874
   ```

2. **Start PostgreSQL**

   ```bash
   docker compose up -d
   ```

3. **Set up the backend**

   - Create and activate a virtual environment under `services/backend/`.
   - Install dependencies with `pip install -r requirements.txt`.
   - Create a `.env` file with `DATABASE_URL` and other settings.
   - Run `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`.

4. **Set up the frontend (optional)**

   - Initialize your chosen frontend framework under `services/frontend/`.
   - Install dependencies (for example, `npm install`).
   - Run the dev server (for example, `npm run dev`).

5. **Run tests**

   - Backend: `pytest` from `services/backend/`.
   - Frontend: project-specific test command once you have one.

---

Additional documentation
------------------------

For deeper details, see:

- `docs/backend.md` – backend modules, routing, and configuration.
- `docs/data-collection.md` – data sources, schemas, and pipelines.
- `docs/recommendation-engine.md` – algorithms, metrics, and implementation notes.

Keep this `README.md` and the `docs/` folder up to date as the project evolves.

