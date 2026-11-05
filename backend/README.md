# Learning Studio API — Phases 1–2

Python 3.12+ / FastAPI / SQLAlchemy 2 / Alembic. Phase 1 authentication and Phase 2 versioned lesson content are implemented; publication/editor workflows remain deferred. The admin Studio status placeholder is preserved. The frontend build and API are served by one process/origin; do not expose a separate cross-origin auth service.

See [content/README.md](content/README.md) for the exact lesson JSON v1 contract, published/draft API, quoted ETags, idempotent pilot import and private content-backup CLI.

## Local setup (from the repository root)

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
# Privately configure the variables below in the process environment first.
.\.venv\Scripts\python.exe -m backend.bootstrap
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

The repository-root module entrypoint above is recommended. The existing `cd backend; uvicorn main:app` entrypoint is also supported for the current Docker integration. For a built frontend accessed directly on port 8000, configure `APP_ORIGIN=http://localhost:8000` instead. For frontend development, proxy `/api` from Vite at `http://localhost:5173` to port 8000 and retain the original browser `Origin`. Use one hostname consistently (localhost and 127.0.0.1 are different origins).

Configure secrets privately in your process environment or an untracked `backend/.env`. Uvicorn can load the latter with `--env-file backend/.env`; the standalone bootstrap command reads the **process environment**, not `.env`. Never commit real passwords, database URLs containing passwords, cookies or tokens. There are no usable default passwords, and no demo-mode bypass.

| Variable | Meaning |
| --- | --- |
| `APP_ENV` | `local` (default outside Render), `test` (temporary automated tests only), or `production`. Render defaults to production if unset and rejects explicit local/test mode. Public deployments must use production. |
| `APP_ORIGIN` | Exact browser origin, no path/trailing slash. Local default `http://localhost:5173`. Required HTTPS origin in production. |
| `DATABASE_URL` | Local default SQLite file `backend/data/learn.db` (ignored by git). Production requires PostgreSQL. Render `postgres://` / `postgresql://` URLs are normalized to `postgresql+psycopg://`. Use provider-required SSL, e.g. `?sslmode=require`. |
| `BOOTSTRAP_ADMIN_PASSWORD` | Private initial `admin` password, 12–256 characters, no leading/trailing whitespace. Required only if the account is missing. |
| `GUEST_PASSWORD` | Private initial `guest` password, same policy. Required only if missing. |
| `SESSION_SECONDS` | Fixed absolute lifetime, default 28,800 (8 hours), positive integer. No sliding refresh. |
| `LOGIN_LIMIT` | Default 10 attempts per IP **and** exact username per window. Counts successful attempts too to bound hash CPU. Positive integer. |
| `LOGIN_WINDOW_SECONDS` | Default 300, positive integer. |
| `DIST_DIR` | Defaults to repository `dist/`. API routes always precede SPA fallback. |

Passwords are scrypt hashed with per-password random salts (N=16,384, r=8, p=5, 64-byte result; OWASP's memory-constrained profile). The bootstrap secrets are read only in bootstrap, never runtime login. Existing account hashes are never changed by bootstrap, even if bootstrap env values change; the variables may be removed after initial provisioning. Both missing accounts are created in a single transaction. Password reset/rotation UI is intentionally not implemented; remove active sessions and use a separately reviewed operator procedure for rotation rather than reviving demo reset routes.

## Migrations, startup and deployment handoff

`backend/migrations/versions/0001_auth.py` is an actual Alembic revision creating users, sessions and persistent throttle tables. Additive revision `0002_throttle_cleanup_index.py` adds a `(window_start, key)` index for bounded expiry cleanup without replacing existing buckets, accounts or sessions. Additive revision `0003_lesson_content.py` adds lessons, mutable drafts, immutable revisions and append-only audit events without changing auth data. The version is recorded in `alembic_version`. No `create_all` shortcut is used.

```powershell
# Migrate and bootstrap (idempotent, never resets existing passwords):
.\.venv\Scripts\python.exe -m backend.bootstrap
# Apply schema only, without requiring bootstrap secrets:
.\.venv\Scripts\python.exe -m backend.bootstrap --migrate-only
```

Every application startup also upgrades to Alembic head, bootstraps missing accounts and imports the missing bilingual `boot-pilot` publication/draft before readiness. Existing authored content is never overwritten; PostgreSQL pilot import has its own transaction advisory lock. This supports free Render services without a shell or predeploy command. Production uses PostgreSQL transaction advisory locks to serialize concurrent migrations and account provisioning. Local SQLite is intended for one development server, not concurrent production workers. Invalid/missing configuration, database failure or missing initial private passwords fails startup, not silent insecure fallback.

Deployment integration (not provisioned by this change): use a **single web service**, repository root working directory, install `backend/requirements.txt`, build the frontend into `dist/`, and start:

```sh
uvicorn backend.main:app --host 0.0.0.0 --port "$PORT"
```

Set `APP_ENV=production`, `APP_ORIGIN=https://<the-exact-service-host>`, a durable PostgreSQL `DATABASE_URL` and the two private bootstrap secrets in the hosting secret store. TLS must terminate at the hosting proxy. Do not deploy SQLite on ephemeral Render storage. Existing static-only Render configuration requires separate integration by the deployment owner. No resources have been provisioned or deployed here.

Back up PostgreSQL before migrations. The initial revision contains a destructive downgrade for operator-led rollback only; do not automatically downgrade on application rollback. Restore from a tested backup when appropriate. Future schema changes must be separate additive revisions.

## API contract and security

All API responses use `Cache-Control: no-store`. No CORS wildcard or bearer-token fallback is enabled. Browser credentials must remain in HttpOnly cookies, not localStorage.

- `GET /api/health`: public readiness/health response.
- `POST /api/auth/login`: `{ "username": "admin" | "guest", "password": "…" }`. Requires exact configured `Origin`; cross-site Fetch Metadata is rejected. Returns `{ "user": { "username": "…", "role": "admin" | "guest" }, "csrfToken": "…" }` and a cookie, **not** an access token. Unknown but well-formed usernames and wrong passwords both return generic 401; failed login creates no session. Only `admin` and `guest` are provisioned. The username syntax is 1–64 ASCII characters, starting with `[a-z]` and continuing with `[a-z0-9_-]`; malformed values, including controls/NUL, are rejected with 422 before database access. Input role/email/extra fields are rejected.
- `GET /api/auth/me`: same response, or 401 if missing, expired or invalid session. Restores frontend user/CSRF state on refresh.
- `POST /api/auth/logout`: authenticated, requires exact `Origin` and `X-CSRF-Token` from login/me. Returns `{ "success": true }`, deletes the server record and expires the cookie. Replaying the old cookie fails.
- `GET /api/studio/status`: admin only, `{ "status": "placeholder" }`; unauthenticated 401 / guest 403.
- Existing eight feature-list placeholders require authentication and return empty arrays to either role.
- `GET /api/lessons` and `GET /api/lessons/{id}` expose current published content to authenticated learners. Admin-only `/api/studio/lessons` and draft GET/PUT support draft reads and CSRF-protected, If-Match-versioned saves. See the [full content contract](content/README.md); draft saves never publish.
- OTP request/verify and password forgot/reset routes return **404** without processing bodies or issuing codes. Unknown `/api` paths return JSON 404, never frontend HTML.

Reusable dependencies in `backend/auth.py`: `authenticated`, `csrf_protected`, and `admin_only`. **All future admin mutations must depend on `admin_only`** (which checks CSRF and origin for unsafe methods). Non-admin authenticated mutations must use `csrf_protected`. Studio GET is read-only and does not require a CSRF header.

Sessions use 256-bit cryptographically random opaque tokens; only SHA-256 digests are persisted. The separate CSRF token is random and bound to that session. Successful login rotates the current browser session and cleans expired records. Cookies use HttpOnly, SameSite=Lax and Path=/; production uses Secure and a `__Host-` cookie name without Domain. SQLite/local HTTP intentionally omits Secure. Sessions have absolute server-enforced expiry and survive process restarts.

Throttles are atomic upserts persisted across restarts/workers, with IP then username limits and `Retry-After` on 429. Once the IP limit is exceeded, no username bucket is created or updated; the IP counter is committed before the 429. Account buckets mitigate distributed guessing but can cause temporary targeted account denial; edge rate limiting is recommended. A separate periodic maintenance task deletes at most 128 buckets older than two windows every 60 seconds **per worker**, using the expiry index and an independent transaction. PostgreSQL skips locked rows; SQLite serializes the single bounded delete with other writers. Failed maintenance logs a secret-safe warning and retries later. There is no full-table cleanup scan on each login. Since cleanup is bounded and periodic, monitor database size and capacity under sustained high-cardinality traffic; expired buckets may accumulate if creation exceeds cleanup capacity.

### Trusted proxy and IP throttle deployment requirement

Auth uses the ASGI `request.client` address; it never parses `X-Forwarded-For` itself. Uvicorn's proxy-header middleware may alter `request.client` **before** auth sees it. The deployment owner must verify the hosting provider's actual ingress topology and configure Uvicorn's `--proxy-headers` and `--forwarded-allow-ips` (or `FORWARDED_ALLOW_IPS`) to trust only the known proxy addresses/networks that connect directly to Uvicorn. Enable header handling only when that trusted proxy strips/replaces untrusted client-supplied forwarding headers and constructs the correct chain. The provider must also prevent public direct access to the backend except through the trusted ingress. Do not use `*`, a public/client-controlled CIDR, or an unverified provider address range; those settings let clients spoof their IP and evade throttling. Uvicorn's default trusted proxy set is generally loopback, not an automatic trust of every hosting proxy; confirm the behavior of the exact deployed version and provider. If reliable client IPs cannot be established, disable proxy headers (`--no-proxy-headers`) and use a trusted edge rate limiter instead: clients behind a shared proxy will otherwise share one bucket and may lock each other out. Test the observed ASGI peer with multiple real clients and spoofed forwarding headers at the deployed edge before release. These are deployment-owner actions; no proxy settings or infrastructure are provisioned here.

Application code never logs request bodies, passwords, cookies or CSRF/session tokens; retain this policy in proxy/access logging. Transport protections do not replace XSS prevention or infrastructure DDoS controls.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest backend -q --junitxml=acceptance-tests/phase-01/backend/junit.xml
# Optional: set TEST_POSTGRES_URL to a disposable local PostgreSQL database
# named learn_acceptance to exercise real PostgreSQL tests.
```

Tests use isolated temporary SQLite files and explicitly public **local-test-only** passwords, not deployed credentials. Coverage includes password hashing/digests, both roles, direct unauthenticated HTTP requests, login origin checks, CSRF/logout/admin mutation protection, session rotation, forged/expired/replayed sessions, restart persistence, bootstrap atomicity/idempotence/CLI, configuration failure, production cookie policy, disabled legacy paths, throttling/reset, SPA/API fallback and health. Throttle regressions exercise malformed input, bounded concurrent bucket growth, indexed bounded cleanup, rollback/retry and migration upgrade. PostgreSQL SQL compilation runs without a server; the optional concurrency, locked-row and auth integration tests require a separate disposable local `learn_acceptance` database supplied by `TEST_POSTGRES_URL`. Hosted PostgreSQL, deployed proxy and browser integration remain release acceptance steps.
