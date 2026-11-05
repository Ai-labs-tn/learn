# AI-assisted authoring contract — Phase 5 (backend only)

Admin-only AI assistance backed by OpenRouter. The provider credential lives
exclusively on the server (`OPEN_ROUTER_API_KEY`); it is never sent to the browser,
never stored in the database and never logged. Suggestions are **advisory plain
text**: the backend never modifies any lesson, draft, revision or publication. The
administrator explicitly accepts, edits or discards a suggestion before any save or
publish; normal draft validation and publication rules still apply afterwards.

`/api/studio/status` remains exactly `{"status":"placeholder"}`.

## Configuration (validated at startup like all Settings)

| Variable | Default | Meaning |
| --- | --- | --- |
| `OPEN_ROUTER_API_KEY` | absent | Absent/empty ⇒ feature disabled: `/assist` returns **503**, `/status` returns `enabled:false` (200). Never fail-open. Present ⇒ required. |
| `LEARN_AI_MODELS` | `google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free,nvidia/nemotron-3-ultra-550b-a55b:free` | Ordered comma-separated model list. When a key exists, the provider catalogue (`https://openrouter.ai/api/v1/models`) is fetched **once at startup** and cached; every configured model must appear there with zero prompt+completion pricing. Unknown or non-free configured models **fail startup**. Malformed list entries also fail validation. |
| `LEARN_AI_DAILY_LIMIT` | `100` | Maximum charged AI requests per UTC day **per workspace** (this deployment is one workspace; all admin users share the budget). |
| `LEARN_AI_TIMEOUT_SECONDS` | `45` | Per-request provider timeout. |
| `LEARN_AI_MAX_OUTPUT_CHARS` | `6000` | Hard output length limit; longer provider output is **rejected (502), never truncated**. |

## Endpoints

Both routes require an **admin** session. `POST /api/studio/ai/assist` is a
state-changing admin route: send the exact configured `Origin` header and
`X-CSRF-Token` from login/me (guest: **403**, anonymous: **401**, missing/invalid
CSRF/origin: **403**). `GET /api/studio/ai/status` is read-only (no CSRF header).
All responses are `Cache-Control: no-store`.

### `GET /api/studio/ai/status` → 200

```json
{"enabled": true, "models": ["google/gemma-4-31b-it:free", "..."], "remainingToday": 99}
```

`remainingToday` = `LEARN_AI_DAILY_LIMIT` minus today's charged requests (see
budget accounting below); never negative. When disabled, `models` still lists the
configured models and `remainingToday` reflects current usage.

### `POST /api/studio/ai/assist`

Request body (strict: unknown fields, nulls for optional fields, wrong types and
markup/URLs are all **422**):

```json
{
  "mode": "improve" | "review" | "translate" | "shorten" | "visual-suggestions" | "storyboard" | "checkpoint",
  "language": "en" | "ta",
  "text": "1–4000 chars, plain text",
  "sceneContext": {"title": "1–160", "summary": "1–1000 (optional)",
                    "beats": [{"id": "lowercase-slug-1-64", "narrationEn": "1–2000"}]},
  "lessonTitle": "1–160 (optional)",
  "maxBeats": 8
}
```

* `language` is the **target/output** language (the translation target for
  `translate`). The input language is irrelevant and never inferred.
* `text` is **required** for `improve`, `review`, `shorten`, `translate`, and
  **rejected** for `visual-suggestions`, `storyboard`, `checkpoint`.
* `sceneContext` is **required** for `visual-suggestions`, `storyboard`,
  `checkpoint`, optional for the text modes. `beats` holds 1–24 items; only the
  first `maxBeats` (1–24, default 8) are included in the provider prompt.
* `text`, beat `narrationEn`, titles and `summary` follow the exact lesson schema
  plain-text rules: no markup (`<`/`>`), no `scheme://` URLs, no `www.`,
  `javascript:`, `data:`, `vbscript:`, no control characters (except tab/newline).

Successful response (**200**):

```json
{"suggestion": "plain text only", "model": "google/gemma-4-31b-it:free", "requestId": "42"}
```

* `suggestion` is plain text validated with the same lesson text rules and
  `LEARN_AI_MAX_OUTPUT_CHARS`; control characters are stripped. It is a
  **suggestion only** — nothing is applied anywhere; the client decides.
* `model` is the model that actually produced the answer (models are tried in
  configured order; see failover below).
* `requestId` is the string form of the recorded usage row id (see below).

Failure responses:

| Status | Meaning |
| --- | --- |
| **503** | No `OPEN_ROUTER_API_KEY` configured; feature disabled. Never fail-open. |
| **429** | Daily workspace budget exhausted (clear message; resets at the next UTC day). The request did not reach the provider. |
| **502** | Provider failure: timeout/connection error, non-retryable HTTP status, malformed/empty response, or output violating plain-text rules or the maximum length. Rejected output is **not truncated and never applied**; the admin sees a clear error so provider misbehavior is visible. |
| **401/403/422** | Authentication, CSRF/origin, body validation as above. |

## Provider call and failover

One `POST https://openrouter.ai/api/v1/chat/completions` attempt **per model**, in
`LEARN_AI_MODELS` order, with the `Authorization` header from the environment,
`temperature 0.3` and `max_tokens` derived from `LEARN_AI_MAX_OUTPUT_CHARS`
(≈ half the character budget plus headroom, bounded 200–8000). The system prompt
describes a bilingual computer-science lesson authoring assistant restricted to
plain text; the user content is built from mode, language, lesson title, scene
context beats and text. On HTTP 402, 429, 404 or "model not found" the next
configured model is tried; **every other status fails immediately** (single
attempt per model, no retry loop). Exhausting all models returns 502.

## Usage accounting, budget and privacy

Every accepted request (one that passed auth, CSRF and body validation while the
feature is enabled) is recorded in the additive Alembic table **`0004_ai_usage`**
(`ai_usage`): `id`, `actor_id` (FK users), `mode`, `model`, `status`
(`ok` | `error` | `blocked`), `input_chars`, `output_chars`, `occurred_at` (UTC
ISO-8601 `Z`). **No prompt text, response text or key material is ever stored.**

Status semantics:

* `ok` — a suggestion was returned.
* `blocked` — the request counted against the daily budget without returning a
  suggestion: either it was denied by the daily limit (429) or the provider output
  was rejected by validation (502). Includes the transient reservation state while
  a request is in flight.
* `error` — the provider failed (timeout, connection, non-retryable status,
  malformed/empty response). Does **not** consume budget.

The daily budget counts today's `ok` + `blocked` rows. The check is **atomic**: one
locked transaction (PostgreSQL advisory lock / SQLite `BEGIN IMMEDIATE`) counts the
day's charged rows and inserts this request's row before the provider is called, so
concurrent workers cannot exceed the limit through a count race. The outcome
transaction then updates the row to its final status. Requests that fail
auth/CSRF/validation, or arrive while the feature is disabled, record nothing.

Logging records only `mode`, `model`, `status` and input/output sizes — never the
API key, prompts or responses. Keep this policy in any proxy/access logs.

## Persistence and rollback

`0004_ai_usage` is additive; existing tables, triggers and data are unchanged and
the daily budget degrades gracefully to "unlimited" if the table were dropped by an
operator (never automatically). The destructive downgrade is for disposable
databases only; production rollback should retain the table and roll back code.
Restoring code without the migration leaves `ai_usage` harmlessly unused.

## Tests

`backend/test_ai.py` never contacts a real provider: startup catalogue verification
is monkeypatched and all chat traffic uses `httpx.MockTransport` with canned
responses. Coverage: settings/startup validation (missing key disables, non-free
model fails startup), auth/CSRF, strict body validation including markup/URL
injection attempts, daily limit with injected dates, provider success, failover on
402/429/404, single-attempt-per-model, timeout/non-retryable 502, rejected outputs,
status endpoint, usage rows and secret-free logs. Run with:

```powershell
.\.venv\Scripts\python.exe -m pytest backend -q
```
