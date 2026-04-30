# Error Handling Audit

## 1) Error Contract Inventory

| Boundary | Source | Current Behavior | Evidence |
|---|---|---|---|
| Backend API | Domain `NotFoundError` | HTTP 404 with `detail` string | `services/backend/app/main.py`, `services/backend/app/exceptions.py` |
| Backend API | Domain `ValidationError` | HTTP 400 with `detail.message` and extra fields | `services/backend/app/main.py`, `services/backend/app/exceptions.py` |
| Backend API | Invalid `arsenal_ball_ids` in slot assignment | HTTP 400 with missing IDs | `services/backend/app/services.py` |
| Backend API | Invalid `arsenal_id` for recommendations/slots | HTTP 404 | `services/backend/app/services.py`, `services/backend/tests/test_new_endpoints_api.py` |
| Backend Service | Two-tower recommendation failure | Warning log, fallback to KNN path | `services/backend/app/services.py` |
| Backend Service | Two-tower training failure | Error payload with logged exception | `services/backend/app/services.py` |
| Backend API | Oil pattern table read failure | Fallback defaults with exception logging | `services/backend/app/main.py` |
| Frontend API | `fetch` network failure | Throws `ApiError(0, message)` | `services/frontend/src/api/client.ts` |
| Frontend UI | Video analysis worker runtime error | Phase switched to `error`, message shown in UI | `services/frontend/src/components/AnalysisView.tsx` |
| Frontend UI | Physics init failure | Phase `ERROR`, warning surfaced, launch disabled | `services/frontend/src/components/SimulationView3D.tsx` |
| Ops Script | Batch JSON import with malformed records | Deterministic non-zero exit and no partial append write | `scripts/manual_entry.py` |
| CI | Step command failures | `set -euo pipefail` enforced per step | `.github/workflows/ci.yml` |
| CI | Long-running hangs | Job timeout configured | `.github/workflows/ci.yml` |

## 2) Failure-Mode Matrix

| Area | Failure Mode | Expected Outcome | Verification |
|---|---|---|---|
| Backend `/slots` | Unknown ball ID | 400 + `detail.missing[]` | `test_slots_invalid_ball_id_returns_400` |
| Backend `/recommendations/v2` | Unknown arsenal UUID | 404 + `"Arsenal not found"` | `test_recommendations_v2_invalid_arsenal_id_returns_404` |
| Backend `/slots` | Unknown arsenal UUID | 404 + `"Arsenal not found"` | `test_slots_invalid_arsenal_id_returns_404` |
| Backend recommendation v2 | Two-tower runtime exception | Warning log + KNN fallback output | Service-level behavior in `get_recommendations_v2` |
| Frontend analysis | Worker returns `error` message | `phase=error`, visible message | `AnalysisView.tsx` |
| Frontend simulation | Physics import/init fails | runtime warning + `ERROR` phase + disabled launch | `SimulationView3D.tsx` |
| Frontend e2e | Browser runtime exceptions | test fails on `pageerror` capture | `tests/e2e/sim3d.spec.ts` |
| Ops script | Invalid JSON record during batch import | exits with status 1 before append operation | `scripts/manual_entry.py` |
| CI | Test command in pipeline fails | immediate step failure due to strict shell | `.github/workflows/ci.yml` |

## 3) Gap Severity (P0/P1/P2)

| Severity | Gap | Resolution |
|---|---|---|
| P0 | Inconsistent handling of invalid IDs between endpoints | Unified with validation + 400/404 mappings |
| P0 | Silent worker/runtime failures in simulation path | Added explicit UI error state and messages |
| P1 | Broad catch without diagnostics in recommendation v2/oil-pattern fallback | Added warning/exception logging |
| P1 | CI hang risk from missing timeouts | Added `timeout-minutes` to all jobs |
| P1 | CI implicit shell behavior | Added `set -euo pipefail` in all run blocks |
| P1 | Batch import partial-write risk in ops path | Added pre-validation and single append write for JSON imports |
| P2 | No repo-level release gate artifact | Added final validation report |

## 4) Standardized Error Semantics

1. Domain validation errors must map to HTTP 400 with structured `detail`.
2. Missing resources must map to HTTP 404 with stable message text.
3. Non-critical fallback behavior must emit logs at warning or error level.
4. Frontend runtime failures must show user-visible feedback and safe disabled actions.
5. E2E critical journeys must fail on uncaught browser exceptions.
6. CI command blocks must run with strict shell options and bounded execution time.
