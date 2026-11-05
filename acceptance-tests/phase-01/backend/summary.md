# Phase 1 backend acceptance — throttle review follow-up

## Result

**84 passed, 9 skipped, 1 third-party deprecation warning**, 77.55 seconds on Python 3.12.10 / Windows.

Command (repository root):

```powershell
.\.venv\Scripts\python.exe -m pytest backend -q --junitxml=acceptance-tests/phase-01/backend/junit.xml 2>&1 | Tee-Object -FilePath acceptance-tests/phase-01/backend/pytest.txt
```

Additional checks:

- `.\.venv\Scripts\python.exe -m pip check` — `No broken requirements found.`
- `.\.venv\Scripts\python.exe -m compileall -q backend` — passed.
- `git diff --check -- backend` — passed (only existing Windows line-ending conversion notices).

Artifacts: `junit.xml`, `pytest.txt`, this summary. All test credentials are explicitly public local-test-only fixtures, not deployed secrets.

## Review findings addressed

1. Removed throttle cleanup from the request/upsert transaction. A lifecycle-managed background task runs at most one batch of 128 expired buckets per 60 seconds per worker, in an independent transaction and a worker thread. PostgreSQL selects bounded, ordered candidates with `FOR UPDATE SKIP LOCKED`; SQLite uses a single atomic bounded DELETE. The cutoff is repeated on DELETE. Shutdown waits for an in-flight maintenance transaction before disposing its engine. Failed maintenance logs no SQL/parameters and retries on the next interval.
2. Added additive Alembic revision `0002_throttle_cleanup_index.py`, creating the `(window_start, key)` index. Tests upgrade an existing revision-0001 database twice and verify preserved bucket data.
3. Always process the IP bucket first; immediately skip username processing if it is already over limit. Counters are committed before returning 429, including IP-only blocked requests.
4. Validate usernames by full-match against `[a-z][a-z0-9_-]{0,63}` before any database statement. Controls, NUL, whitespace, Unicode and invalid punctuation return 422. Only admin/guest accounts are provisioned; well-formed unknown names retain generic 401 behavior.
5. Expanded backend README with Uvicorn trusted-proxy/forwarded-address requirements, risks of wildcard trust and shared proxy buckets, ingress header sanitation, edge verification and deployment-owner responsibilities. No deployment settings were changed.

## Regression evidence

New `backend/test_throttle.py` covers:

- No additional username buckets after IP blocking, with persisted denied-request counters.
- Persisted username-limit counters and concurrent IP limiting with bounded bucket growth.
- Bounded expiry deletion, cutoff boundary/current-row preservation and index/query-plan verification.
- Maintenance rollback and successful retry.
- Concurrent cleanup workers and login upserts without database-lock failures on SQLite.
- SQL compilation of bounded PostgreSQL `SKIP LOCKED` cleanup.
- Background interval scheduling, failure/retry behavior and secret-safe warnings.
- Seventeen malformed username HTTP cases asserting **zero database statements**.
- Additive migration upgrade preserving existing data.
- Optional PostgreSQL variants and a locked-row nonblocking cleanup test, ready for a configured disposable database.

The existing 58 API tests also pass, covering passwords/digests, both roles, cookies, login-origin checks, CSRF/logout/admin dependencies, expiry/rotation/replay, persistence, bootstrap/migrations/configuration, disabled legacy routes, SPA/API routing, and actual Uvicorn HTTP smoke through both supported launch entrypoints.

## Skips and limitations

- `TEST_POSTGRES_URL` was not configured; no PostgreSQL/Docker commands were available on PATH. Eight database-dependent cases were skipped (seven new regression variants and the existing owner-authored PostgreSQL acceptance test); one SQLite case correctly skips PostgreSQL-only row-lock semantics. No PostgreSQL server was provisioned or contacted. Live PostgreSQL deadlock/locking acceptance therefore remains an integration step, not a claimed result.
- Set `TEST_POSTGRES_URL` to a disposable **local** database named `learn_acceptance` to enable PostgreSQL cases. New test records are uniquely identified and cleaned up; negative synthetic expiry times isolate cleanup fixtures from ordinary live test buckets. Do not point these tests at deployment data or run them against an application-managed database.
- Real hosted HTTPS/browser and trusted-proxy behavior still require deployment-owner validation. Backend code does not trust raw forwarded headers; Uvicorn must be configured for the verified ingress topology.
- Bounded periodic cleanup intentionally does not drain the entire table in a request. Monitor bucket storage under sustained distributed/high-cardinality traffic; cleanup capacity is bounded to 128 rows per minute per worker.
- The warning is from Starlette TestClient deprecating its HTTPX adapter; all executed tests pass.
- No edits were made to the owner-authored `backend/test_postgres.py`, Docker, frontend or deployment files. Outside backend, only allowed acceptance reports were updated. No commits, provisioning or deployment were performed.
