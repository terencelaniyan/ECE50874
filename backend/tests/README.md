# Backend tests

- **Unit tests** (`test_gap_engine.py`): No database. Run from `backend/`:

  ```bash
  cd backend && python -m pytest tests/ -v
  ```

  With `DATABASE_URL` unset, integration tests are skipped.

- **Integration tests** (`test_gaps_api.py`, marker `integration`): Require a running Postgres and `DATABASE_URL` in the environment, plus a seeded `balls` table. If `DATABASE_URL` is not set, these tests are skipped. To run only unit tests and skip integration:
  ```bash
  cd backend && python -m pytest tests/ -m "not integration" -v
  ```
