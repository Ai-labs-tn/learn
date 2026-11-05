# Lesson content contract — Phase 2 / schemaVersion 1

The authoritative validator is `backend/content/schema.py` (Pydantic v2, strict types,
unknown fields forbidden **at every level**). The shipped example is
`boot-pilot.v1.json`, lesson ID **`boot-pilot`**. Frontend implementations must follow
this contract, not the legacy simulation objects. There is no publish/history API in
Phase 2; saving a draft never changes published content. `/api/studio/status` remains
`{"status":"placeholder"}`.

## Exact document shape

```json
{
  "schemaVersion": 1,
  "id": "boot-pilot",
  "title": "Power on, firmware and POST",
  "description": "An illustrative startup sequence before the OS loads.",
  "scenes": [{
    "id": "power-on",
    "title": "Power on",
    "beats": [{
      "id": "power-arrives",
      "narration": {"en": "Power arrives.", "ta": "மின்சாரம் வருகிறது."},
      "captions": {"en": "Power arrives"},
      "visual": {"component": "boot-machine", "focus": "power", "action": "focus"}
    }]
  }]
}
```

* All displayed fields are required except `captions` and action-specific visual
  fields below. `schemaVersion` must be the integer `1` (not `true`, `1.0`, `"1"`,
  or a future version). No coercion of strings/numbers/booleans.
* IDs are stable lowercase ASCII slugs matching `^[a-z][a-z0-9-]*$`, length 1–64.
  The lesson ID must match its URL. Lesson, scene and beat IDs must be **globally
  unique within that document**. IDs need not be unique across different lessons.
* `title` and scene `title`: 1–160 characters; `description`: 1–1000.
* `scenes`: 1–12; scene `beats`: 1–24; total beats: at most 120.
* `narration`: both `en` and `ta` required, each 1–2000 characters.
* Optional `captions`: at least one of `en`/`ta`, each 1–2000 characters.
  **Omit a missing language key**; explicit null and an empty object are invalid.
  Render each language's caption override when present, otherwise its narration.
  Do not silently substitute English for missing Tamil narration (both are required).
* No blank/whitespace-only text, markup (`<`/`>`), URL schemes (`scheme://`),
  `www.`, `javascript:`, `data:`, `vbscript:` or ASCII control characters (except
  tab/newline) in any text. Content is plain text only: render as text, never HTML,
  execute code, or fetch a content-provided URL. No asset, CSS, script or URL fields.
  Quotes and ordinary English/Tamil punctuation are supported. The validation is a
  data-shape restriction, not a sanitizer allowing HTML execution.
* Canonical JSON (`json.dumps(..., ensure_ascii=False)` of validated data with null
  defaults omitted) must fit 262144 UTF-8 bytes. Character limits count Unicode
  code points; UTF-8 byte bounds also apply to Tamil.
* `captions`, `from`, `to`, and `status` are optional only as described; explicit
  null is not a substitute for omission. All other fields are non-null.

### Visual registry and combinations

`component` is exactly `boot-machine`. `focus` is one of `power`, `firmware`, `cpu`,
`ram`, `storage`, `overview`. No arbitrary component names, instructions or props.

| action | Required extra fields | Restrictions |
| --- | --- | --- |
| `focus` | none | `from`, `to`, `status` must be absent; any focus allowed |
| `signal` | `from`, `to` | Registered directed pair below; focus is one endpoint; `status` absent |
| `status` | `status`: `idle`, `checking`, or `passed` | Focus is physical, not `overview`; `from` and `to` absent |

Directed signal pairs (not symmetric): `power→firmware`, `power→cpu`,
`firmware→cpu`, `cpu→ram`, `ram→cpu`, `storage→ram`, `cpu→storage`,
`storage→cpu`, `cpu→firmware`. Endpoints are physical focuses, never `overview`.

Examples:

```json
{"component":"boot-machine","focus":"cpu","action":"signal","from":"firmware","to":"cpu"}
```

```json
{"component":"boot-machine","focus":"ram","action":"status","status":"checking"}
```

The v1 schema intentionally does **not** yet include checkpoints, initial-state,
playback timings or executable choreography. Those plan items require a coordinated
future schema version. The proposed Phase 2 shape above is the complete accepted
v1 shape; renderers should reconstruct their own deterministic base state and apply
only the registered beat cue. The pilot is adapted from `bootTimeline.ts` power,
CPU wake, firmware and POST and `bootCaptions.ta.ts`, with bilingual technical
clarifications (firmware is software; POST isn't exhaustive; OS is not loaded).

## HTTP API

All `/api/` responses are `Cache-Control: no-store`. Use the existing session cookie.
Anonymous known routes: 401. Guest Studio requests, including writes: 403. There
are no direct revision/draft-publication lookup routes available to learners.

* `GET /api/lessons` — authenticated; array of published metadata only:
  `{id,title,description,revision,publishedAt}`. Draft title/description never leak.
* `GET /api/lessons/{id}` — authenticated; exactly
  `{document,revision,publishedAt}` for the current published pointer; 404 if absent.
  Keep the returned revision with the running playback session.
* `GET /api/studio/lessons` — admin; array
  `{id,title,description,version,baseRevision,publishedRevision,updatedAt}` from drafts.
* `GET /api/studio/lessons/{id}/draft` — admin; exactly
  `{document,version,baseRevision}` plus **`ETag: "1"`** (quoted version integer).
* `PUT /api/studio/lessons/{id}/draft` — admin + existing same-origin/CSRF checks;
  body is **the document itself**, not a wrapper. Supply `Origin` matching APP_ORIGIN,
  `X-CSRF-Token` from login/me and **`If-Match: "1"`** copied from draft ETag.
  Successful response has the same shape as draft GET, incremented version/ETag.
  `baseRevision` remains unchanged. No changes to lessons' publication pointer.
  Missing If-Match: **428**. Stale/malformed, unquoted, weak, wildcard or list tags:
  **409**. Supported version header range: 1–2147483646. Not found: **404**.
  Invalid document / mismatched document ID: **422**. Authentication/CSRF is checked
  before handler mutation, including for a missing version header. For multiple
  simultaneous errors, FastAPI body validation may return 422 before handler-level
  precondition checks. Reload after a 409 and merge deliberately; never retry blindly.
* No create, publish, restore, delete, AI or backup HTTP routes in Phase 2.

Times are UTC ISO-8601 strings ending in `Z`. Revision/version integers begin at 1.
Strong quoted ETags are mandatory; clients must not use unquoted JSON version numbers
as raw If-Match values. Saving uses one atomic conditional SQL UPDATE plus audit
append in a single transaction; two clients saving version N cannot both succeed.

## Persistence, import, backup and rollback

Additive Alembic revision `0003_lesson_content` adds `lessons`, `lesson_drafts`,
`lesson_revisions`, `lesson_audit_events`; existing users/sessions/throttle tables
are unchanged. Composite foreign keys constrain publication and draft base pointers
to revisions of the same lesson. DB triggers reject UPDATE/DELETE of revisions and
audit events (also TRUNCATE on PostgreSQL and replacement INSERTs on SQLite). This guards accidental SQL/ORM writes;
a DB owner can still change triggers/schema. No content secrets are stored.

Startup migrates, provisions missing accounts, then validates/imports the pilot
**before readiness**. PostgreSQL import uses transaction-scoped advisory lock
714202603; SQLite uses BEGIN IMMEDIATE. One transaction creates lesson, revision 1,
publication pointer, draft version 1, and audit events. Repeated import/startup never
overwrites an existing publication or draft, including edited draft text/version.
If only the draft is missing it is initialized from the current publication, not
from the bundled pilot. An existing unpublished lesson is left untouched. Startup
failure is fatal rather than serving with an incomplete import.

Operator commands from repository root, using an **explicit local/disposable**
DATABASE_URL (do not point these at any shared/live database without separate approval):

```powershell
.venv\Scripts\python.exe -m backend.bootstrap --migrate-only
.venv\Scripts\python.exe -m backend.content.cli import-pilot
.venv\Scripts\python.exe -m backend.content.cli export --output private-content-backup.json
```

The export does not migrate or import. It reads a consistent snapshot (PostgreSQL
REPEATABLE READ, SQLite explicit read transaction) and writes UTF-8 bilingual JSON
with `backupVersion:1`, `exportedAt`, `lessons`, `drafts`, `revisions`, `auditEvents`.
It includes actor/user **IDs** for attribution but never users/password hashes,
sessions/tokens/CSRF values, environment settings or provider credentials. Requires
trusted operator DB access, not a browser admin cookie. Keep backups private because
they include unpublished drafts; file permissions follow the operator's local ACL
and umask. It refuses to overwrite an existing output file. Export is a content
backup, not a PostgreSQL disaster-recovery backup or an automatic restore command.
Retain a normal database backup separately. Restore tooling/publish APIs are deferred;
validate backed-up documents with `LessonDocument` before any future restore.

For rollback, roll back application code and **retain these additive tables**.
The migration downgrade destroys Phase 2 content and is for disposable databases
only; export first. No deployment or live migration is part of these changes.

Run full local tests with `.venv\Scripts\python.exe -m pytest backend -q`.
The optional PostgreSQL suite accepts only an explicitly configured localhost
`TEST_POSTGRES_URL` ending in `/learn_acceptance`; it is skipped when unavailable.
No external AI/provider requests are made.
