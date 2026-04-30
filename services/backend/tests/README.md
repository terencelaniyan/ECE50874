# Backend tests

- **Unit tests** (engine/math modules such as `test_gap_engine.py`, `test_recommendation_engine.py`, `test_slot_assignment.py`, `test_degradation.py`, plus service helpers): No database. Run from `services/backend/`:

  ```bash
  cd services/backend && python -m pytest tests/ -v
  ```

  With `DATABASE_URL` unset, integration tests are skipped by marker.

- **Integration tests** (API suites such as `test_gaps_api.py`, `test_recommendations_api.py`, `test_arsenals_api.py`; marker `integration`): Require a running Postgres and `DATABASE_URL` in the environment, plus a seeded `balls` table and arsenal migrations. If `DATABASE_URL` is not set, these tests are skipped. To run only unit tests and skip integration:

  ```bash
  cd services/backend && python -m pytest tests/ -m "not integration" -v
  ```

- **CI split:** `.github/workflows/ci.yml` runs backend unit tests and integration tests in separate steps, then runs frontend and Playwright jobs.
