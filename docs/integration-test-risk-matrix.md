# Integration Test Risk Matrix

This file defines the integration coverage baseline for the codebase.
It maps user-critical flows to existing tests and identifies the next test target.

## Risk Levels

- `Critical`: User-facing failure likely blocks core product usage.
- `High`: Major feature degradation or confusing results.
- `Medium`: Limited feature degradation with workaround.

## Backend Endpoint Chains

- `Critical` Arsenal lifecycle chain
  - Flow: `/arsenals` create/update/delete -> `/recommendations` -> `/gaps` -> `/slots`
  - Existing coverage: `services/backend/tests/test_arsenals_api.py`, `services/backend/tests/test_recommendations_api.py`, `services/backend/tests/test_gaps_api.py`, `services/backend/tests/test_new_endpoints_api.py`
  - Gap to close: expand lifecycle chain assertions beyond status/shape checks to include recommendation/slot quality invariants.

- `High` V2 recommendation strategy/fallback
  - Flow: `/recommendations/v2` with `knn`, `two_tower`, `hybrid`, and degradation models
  - Existing coverage: `services/backend/tests/test_new_endpoints_api.py`, `services/backend/tests/test_integration_workflows_api.py`
  - Gap to close: add deterministic fallback-behavior assertions when model artifacts are unavailable.

- `High` Error contract consistency
  - Flow: invalid/mutually exclusive payloads for `/recommendations`, `/recommendations/v2`, `/gaps`, `/slots`, `/degradation/compare`
  - Existing coverage: `services/backend/tests/test_recommendations_api.py`, `services/backend/tests/test_new_endpoints_api.py`, `services/backend/tests/test_gaps_api.py`, `services/backend/tests/test_integration_workflows_api.py`
  - Gap to close: increase edge-case breadth for malformed-but-schema-valid payloads.

- `Medium` Admin endpoint protection
  - Flow: `/admin/refresh-catalog`, `/admin/train-model`
  - Existing coverage: `services/backend/tests/test_admin_api.py`
  - Gap to close: add positive-path admin tests using mocked script/training execution.

## Frontend Integration Surfaces

- `Critical` Grid view right-panel orchestration
  - Flow: bag changes trigger recommendations and slot assignment in the right panel
  - Existing coverage: `services/frontend/src/App.integration.test.tsx`, `services/frontend/src/components/RecommendationsPanel.test.tsx`
  - Gap to close: test panel switch and API failure/recovery behavior in one integration path.

- `High` API error propagation contracts
  - Flow: API wrappers surface backend errors consistently to callers
  - Existing coverage: endpoint-specific unit tests in `services/frontend/src/api/*.test.ts`
  - Gap to close: integration-style contract checks for shared error payload shape handling.

## Browser E2E Journeys

- `Critical` Catalog -> Grid -> Recommendations
  - Existing coverage: `services/frontend/tests/e2e/recommendations.spec.ts`
  - Gap to close: expand error-state rendering and broader recommendation-v2 parameter permutations.

- `High` Catalog -> Grid -> Slots
  - Existing coverage: `services/frontend/tests/e2e/slots.spec.ts`
  - Gap to close: deepen `/slots` payload edge cases (partial coverage + failure/retry), while empty-state copy is now covered.

- `High` Degradation and simulation paths
  - Existing coverage: `services/frontend/tests/e2e/degradation.spec.ts`, `services/frontend/tests/e2e/simulation.spec.ts`, `services/frontend/tests/e2e/sim3d.spec.ts`
  - Gap to close: keep simulation-heavy assertions in full/nightly path due to runtime cost; add deeper degradation permutation coverage as needed.

- `High` Arsenal persistence and grid/database interaction
  - Existing coverage: `services/frontend/tests/e2e/arsenal-save-load.spec.ts`, `services/frontend/tests/e2e/grid-voronoi.spec.ts`, `services/frontend/tests/e2e/ball-database.spec.ts`
  - Gap to close: add keyboard interaction depth on grid points and broader table/filter permutations.

- `Medium` Analysis tab readiness
  - Existing coverage: `services/frontend/tests/e2e/analysis.spec.ts`
  - Gap to close: add fixture-backed upload -> processing -> result rendering path in CI.

## CI Target Policy

- PR lane targets:
  - Backend integration marker tests.
  - Frontend vitest integration/API tests.
  - E2E smoke subset (recommendations + slots + degradation).
- Nightly lane targets:
  - Full E2E suite including simulation-heavy tests.
