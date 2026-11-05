# Phase 2 backend acceptance evidence

Scope: backend-only versioned lesson persistence/read API/draft editing/import/export.
No frontend, package, deployment or CI changes by this worker. No shared/live DB,
secrets inspection, external provider/AI calls, commit or deployment.

Environment: Windows; repository `.venv\Scripts\python.exe`; temporary local SQLite
files created by pytest. Optional PostgreSQL cases require an explicit localhost
`TEST_POSTGRES_URL` for disposable `learn_acceptance`; no PostgreSQL executable or
Docker was found on PATH during this run, and no PostgreSQL test DB was configured.
PostgreSQL cases therefore **skip**, not pass. PostgreSQL DDL compilation remains
covered by the full suite; real PostgreSQL runtime verification remains outstanding.

## Contract and implementation

See `backend/content/README.md` for the exact v1 schema, visual registry, HTTP
responses/quoted If-Match semantics, import guarantees and backup commands.
Migration `0003_lesson_content` is additive to Phase 1. No publish API is added;
`/api/studio/status` remains `{"status":"placeholder"}`.

## Commands and results

* Initial full-suite invocation with a 120-second tool limit timed out before a
  summary (no failures shown at that point). It is **not counted as a passing run**.
* `.venv\Scripts\python.exe -m pytest backend/test_content.py -q`:
  **60 passed, 9 skipped, 1 warning in 25.51s** initially; final rerun after
  additional fresh concurrent-import and SQLite replacement-write assertions:
  **60 passed, 9 skipped, 1 warning in 56.24s**.
* `.venv\Scripts\python.exe -m pytest backend -q` full-suite rerun:
  **144 passed, 18 skipped, 1 warning in 155.93s (0:02:35)** initially.
  Final rerun after those additional assertions:
  **144 passed, 18 skipped, 1 warning in 289.41s (0:04:49)**.
  Raw output: `full-backend-tests.txt`. The warning is the installed Starlette
  TestClient/httpx deprecation, not a failing test. Skips comprise unconfigured
  optional PostgreSQL cases plus the existing SQLite row-lock-semantics skip.

## Assertions exercised by `backend/test_content.py`

* Unknown schema versions/types/fields; IDs; bilingual required narration; caption
  overrides/null handling; bounds including UTF-8 size/beat totals; script/URL text;
  registered focuses/actions/directed signal combinations.
* Anonymous published/draft reads and writes denied; guest draft/list/write denial;
  predictable revision URLs unavailable; authenticated metadata/publication reads.
* Admin draft ETag/read/save; missing and malformed/stale If-Match; origin, CSRF,
  Sec-Fetch-Site checks; mismatched ID; invalid input cannot increment draft version.
* Saving draft changes neither published document nor published metadata; exactly
  one audit append and actor/version attribution on a successful save.
* Six simultaneous same-version writes yield exactly one 200 and five 409s.
* Injected audit failure rolls back both the update and its audit append.
* Database UPDATE/DELETE and SQLite replacement-INSERT protection for revisions/audit;
  publication/base foreign keys and positive draft versions. Optional PostgreSQL
  additionally tests TRUNCATE.
* Concurrent fresh/repeated import, application restart/session reuse, and edited draft
  preservation; later publication preservation and missing-draft repair from that
  publication rather than the bundled pilot.
* Real subprocess export CLI round-trip of bilingual drafts/revisions/audit, no
  auth secrets, no mutation, overwrite refusal, and idempotent import CLI.
* Upgrade from Phase 1 preserves user hashes, sessions and throttle counters.

## Limitations / deferred work

* Real PostgreSQL acceptance is optional and skipped locally; no claim that its
  advisory locks/triggers were runtime-verified here. Those tests isolate a unique
  schema inside the explicit local disposable database when configured.
* Checkpoints/initial state are deliberately not in the user-proposed minimal v1
  document. Publication/history/restore HTTP APIs remain Phase 3. Backup export is
  implemented; no automatic restore command or DB disaster-recovery claim.
* This worker owns backend and these evidence files only; frontend integration and
  its tests belong to the parent session and are not claimed by this evidence.
