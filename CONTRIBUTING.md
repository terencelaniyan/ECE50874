# Contributing

This document defines how to contribute safely and consistently to this repository.

Why this exists:
- Keep pull requests focused and reviewable.
- Keep CI stable by running the right tests before opening a PR.
- Keep docs aligned with behavior.

How to use it:
- Follow the branch and PR flow below.
- Run the test set that matches your change scope.
- Use the definition-of-done checklist before requesting review.

## Branch and PR workflow

1. Sync your local `main` (or `master`) branch.
2. Create a focused feature branch:

```bash
git checkout -b feat/short-topic-name
```

3. Make small, scoped changes.
4. Commit with clear messages that describe intent.
5. Open a PR to `main` (or `master`), with:
   - what changed
   - why it changed
   - how it was tested

## Commit expectations

- Keep each commit focused on one logical change.
- Prefer clear, imperative messages.
- Avoid mixing refactor + feature + docs in one commit unless tightly coupled.

Example style:
- `add backend README quickstart`
- `fix arsenal integration test setup`
- `document local postgres troubleshooting`

## Local test expectations

Run from repo root unless noted.

- Backend-only code change:
  ```bash
  cd services/backend && python -m pytest tests/ -m "not integration" -v
  ```

- Backend API/database change:
  ```bash
  cd services/backend && python -m pytest tests/ -m "integration" -v
  ```

- Frontend UI/state/API-client change:
  ```bash
  cd services/frontend && npm run test:run
  ```

- Cross-stack flows or end-user workflow changes:
  ```bash
  cd services/frontend && npm run test:e2e
  ```

Match your local test selection to CI in `.github/workflows/ci.yml`:
- backend job: unit + integration
- frontend job: coverage run
- e2e job: Playwright

## Documentation update rule

If you change behavior, configuration, commands, or workflow, update documentation in the same PR.

Typical doc targets:
- `README.md` for top-level run/setup flow
- `services/backend/README.md` for backend-local setup and commands
- `docs/backend.md` or `docs/frontend.md` for deeper technical behavior
- `docs/troubleshooting.md` for recurring failure modes

## Definition of done checklist

Before requesting review:

- [ ] Changes are scoped and intentional.
- [ ] Relevant tests pass locally.
- [ ] New/changed behavior is documented.
- [ ] No secrets were added to tracked files.
- [ ] PR description explains what, why, and test evidence.

## Security and secrets

- Never commit `.env` or credentials.
- Keep `.env.template` as placeholders only.
- Use `ADMIN_KEY` for admin routes; do not hardcode it anywhere.
