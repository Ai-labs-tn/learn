# Phase 3 backend acceptance evidence

Scope: backend only, based on Phase 2 commit `2b259fe`. No frontend, CI, deployment,
secrets, shared/live database access or schema migration changes.

## Implementation

- Admin + existing same-origin/CSRF protections for create, publish and restore.
- Create returns 201, draft version 1, null base revision and quoted ETag; ID
  collisions return 409. Unpublished lessons are absent from learner results.
- Save, publish and restore share an atomic conditional draft UPDATE. A request
  claims the supplied current version before reading publication content or
  allocating the next revision. Locks are held through the transaction commit.
- Publication appends an immutable revision, updates publication/base pointers,
  increments draft version and appends the attributed audit in one transaction.
- Restore copies only that lesson's immutable historical document into a new draft
  version, retaining the current baseRevision and publication pointer. A later
  explicit publish creates a new revision. Missing source rolls back the claim.
- Admin history returns only revision/title/publication time, newest first.
- Existing immutable revision/audit triggers and schema are reused unchanged.
- `/api/studio/status` remains exactly `{"status":"placeholder"}`.
- Exact frontend contracts: `backend/content/README.md`.

## Automated coverage

`backend/test_studio.py` reuses the Phase 2 isolated database fixtures:

- Create -> save -> first publish -> next edit/publish -> authenticated guest read
  -> restore older revision as draft -> publish as a new immutable revision.
- Empty unpublished history, newest-first historical metadata, unchanged older
  history and immutable document snapshots, attributed audit/version sequence.
- Unpublished learner index/detail isolation; anonymous 401; guest Studio 403.
- CSRF/origin/fetch-site checks for every new write route.
- Required quoted strong ETags: missing 428, stale/malformed 409, missing draft 404.
- Full existing invalid LessonDocument matrix on create; strict restore body,
  missing source revision, no failed-request state/audit/version changes.
- Six competing publishers: one success and five 409s; mixed save/publish/restore,
  six competing restores, and duplicate creates also have exactly one winner.
- Injected audit insertion failures roll back create, publish and restore entirely,
  including publication revisions/pointers and draft version changes.

The full backend suite additionally exercises revision/audit UPDATE/DELETE
rejection, foreign keys, immutable triggers, concurrent saves, migration/import
idempotence, export, authentication and throttling.

## Local validation

Tests run using the repository `.venv` from the repository root. SQLite fixtures
use fresh temporary files. Optional PostgreSQL tests are opt-in only: the existing
fixture requires localhost/127.0.0.1 and database `learn_acceptance`, then creates
and drops a uniquely named isolated schema. No PostgreSQL server or external
provider was contacted by this work when the optional URL is absent.

Final full run: **159 passed, 33 skipped, 1 warning in 135.72s**, exit 0.
Optional PostgreSQL was not configured and was skipped, not validated. The existing
Starlette/httpx TestClient deprecation warning remains. `test-results.txt` records
all runs, including two earlier transient Uvicorn login timeouts and their passing
isolated/full reruns; no timeout or production-code workaround was applied.
