# Phase 5 backend acceptance evidence

Scope: backend only (`backend/**` plus this evidence directory). No frontend, CI,
packaging, commit or deployment changes. No real provider calls: every test uses a
monkeypatched startup model-catalogue check and `httpx.MockTransport` with canned
responses; `.env.render` was not read. `/api/studio/status` remains exactly
`{"status":"placeholder"}`.

## Implementation

- New `backend/ai/` package: `provider.py` (OpenRouter access, free-model
  catalogue fetch, ordered single-attempt-per-model failover) and `api.py`
  (admin-only endpoints, strict request validation, prompt building, output
  validation, atomic daily budget gate, usage recording, secret-free logging).
- `backend/settings.py` extended and validated like all Settings:
  `OPEN_ROUTER_API_KEY` (absent/empty disables the feature; present key must be
  whitespace-free, ≤512 chars), `LEARN_AI_MODELS` (ordered comma-separated,
  default three zero-cost models, malformed/duplicate entries rejected),
  `LEARN_AI_DAILY_LIMIT` (default 100), `LEARN_AI_TIMEOUT_SECONDS` (45),
  `LEARN_AI_MAX_OUTPUT_CHARS` (6000), all positive.
- Additive Alembic revision `0004_ai_usage`: `ai_usage` table (actor, mode,
  model, status `ok|error|blocked`, input/output sizes, occurred_at) plus a
  `(occurred_at, status)` index. No prompt/response text, no keys, no changes to
  existing tables or triggers. `alembic_version` is now `0004_ai_usage`
  (version assertions in `test_api.py`/`test_content.py` updated accordingly).
- `POST /api/studio/ai/assist` (admin + CSRF/origin via `admin_only`): modes
  `improve|review|translate|shorten|visual-suggestions|storyboard|checkpoint`,
  `language` `en|ta` target, strict body (unknown fields, explicit nulls, wrong
  types rejected; text/scene context follow the exact lesson plain-text rules —
  no markup, URLs, `javascript:`/`data:`/`vbscript:`, control characters).
  Returns `{suggestion, model, requestId}`; the suggestion is advisory only and
  is never applied to any lesson/draft/publication.
- Provider: one POST per configured model to
  `https://openrouter.ai/api/v1/chat/completions` with the env key,
  temperature 0.3, max_tokens derived from the output-length setting; 402/429/
  404/model-not-found fall through to the next model; any other status fails
  immediately; exhausting models returns a clear 502. Output is control-char
  stripped, then validated against lesson plain-text rules and the maximum
  length — over-limit or unsafe output is rejected (502), never truncated.
- `GET /api/studio/ai/status` (admin, read-only): `{enabled, models,
  remainingToday}`; disabled without a key (200), assist returns 503 — never
  fail-open.
- Daily budget: one locked transaction (PostgreSQL advisory lock / SQLite
  `BEGIN IMMEDIATE`) counts today's `ok`+`blocked` rows and appends this
  request's row before the provider is called; over the limit the request is
  denied with 429 and never reaches the provider. Provider failures are recorded
  as `error` and do not consume budget; rejected output and denials are
  `blocked` and do.
- Privacy: credentials stay server-side; logs record only mode/model/status and
  sizes. Exact frontend contract: `backend/ai/README.md`.

## Automated coverage (`backend/test_ai.py`, 82 tests)

- Settings/startup: missing key disables; present key enables; `LEARN_AI_MODELS`
  parsing (whitespace/empty entry errors, defaults); invalid AI settings matrix;
  free-model catalogue filtering keeps only zero-cost ids; `configure_ai`
  rejects unknown/non-free configured models; app startup itself fails when a
  configured model cannot be verified free.
- Endpoint security: anonymous 401, guest 403, CSRF/origin/fetch-site matrix for
  assist, guest 403 and anonymous 401 for status, and no usage rows for denied
  requests; no-key 503 with a clear message and no fail-open; status 200 with
  `enabled:false`; Studio placeholder unchanged.
- Strict body validation: a 40-case invalid-body matrix including markup, URL,
  `javascript:`/`data:` schemes, control characters, wrong types, explicit
  nulls, mode/text/sceneContext mismatches, beat limits and extra fields — all
  422 with no rows recorded.
- Success contract: exact response keys, canned suggestion, first configured
  model, Authorization header from env, payload shape (messages, temperature,
  derived max_tokens), scene-context prompt bounded by `maxBeats`, and a usage
  row (status ok, actor, sizes, occurred_at) with `requestId` matching the row.
- Failover/failure: 402/429/404 and "model not found" 400 fall through in order
  with exactly one attempt per model; all models exhausted → 502 (`error` row);
  non-retryable 401 → immediate 502 without failover; simulated timeout → 502;
  malformed/empty provider responses → 502.
- Output validation: URLs/markup/schemes/over-limit output → 502 (`blocked`
  row) with no echo of the rejected text; control characters stripped; the
  length limit is configurable.
- Daily limit: enforced with a limit of 1 (second request 429, provider never
  called, `blocked` denial row, remainingToday 0) and reset via injected
  next-day date/timestamp; provider errors do not consume budget.
- Privacy: logs and responses contain no API key, no prompt text and no
  suggestion; log lines contain only mode/model/status/sizes; stored rows have
  exactly the eight accounting columns and none of the secret/text material.

## Local validation

Tests run using the repository `.venv` from the repository root with isolated
temporary SQLite databases. The optional PostgreSQL suite was not configured
and skipped. No external provider or network request was made.

Final full run: **241 passed, 33 skipped, 1 warning in 210.61s**, exit 0
(junit.xml and full-backend-tests.txt). One earlier full run had a single
transient pre-existing export-CLI subprocess failure caused by a negative
timeout from a local monotonic-clock anomaly; it passed in isolation and in the
final full rerun with no production or test changes for it — see
`test-results.txt` for every run.
