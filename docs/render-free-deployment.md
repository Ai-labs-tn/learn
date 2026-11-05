# Free-only Render deployment gate

Approval: use free tiers only. Never select a paid plan, attach a paid disk, upgrade an expired database or enable paid AI calls without separate approval.

## Current state

The existing `render.yaml` serves the static V1 site. Do not replace or delete that service during development. A login-gated frontend requires the new API to be reachable before it is released. For a same-origin preview, deploy a separate Docker web service with its own hostname, serving frontend and API together. Leave the existing V1 URL unchanged until the replacement has passed smoke tests.

## Free-tier limitations verified 2026-11-05

Source: https://render.com/docs/free

- Explicitly choose `free` for both the web service and PostgreSQL.
- A workspace can have only one active free PostgreSQL database. If one already exists, stop and review rather than provisioning a paid alternative.
- Free PostgreSQL expires after 30 days, then has a 14-day grace period before deletion. It has no managed backups. Export content before expiry; never auto-upgrade.
- Free web services sleep after 15 idle minutes; startup can take around a minute. No keepalive traffic is introduced to circumvent this.
- The web service filesystem is ephemeral. SQLite is suitable for local tests only, not hosted content persistence.
- Included service hours, bandwidth and build minutes are limited. Even free instances can incur bandwidth/build overages if billing is enabled. Check workspace spend controls before deployment; free instance selection alone does not guarantee a zero invoice. If zero-cost enforcement cannot be verified, stop for the owner's decision.

## Access blocker

At preflight, the tool browser navigated to Render's sign-in page and no Render credential environment variables or Render management integration were available. Owner sign-in or private configuration is required. Do not paste private credentials into tracked files or acceptance evidence.

## Prepared deployment configuration

`render-free.yaml` is an explicitly selected, separate Blueprint for branch `learning-studio`. It declares a single Docker web service and PostgreSQL with `plan: free` for both, disables preview environments and waits for CI checks before automatic deploys. It does not replace `render.yaml` or the V1 static service. Resource names/availability and schema validation still require Render access.

The Docker image builds frontend assets and serves them with FastAPI. Set the exact final HTTPS `APP_ORIGIN` and the two initial passwords through Render's private environment settings. `FORWARDED_ALLOW_IPS` must contain verified proxy IPs/CIDRs for the hosting path; do not blindly trust arbitrary forwarded headers. Confirm client-IP behavior before relying on per-IP login throttling.

CI is prepared to run backend tests with a disposable PostgreSQL service, desktop/mobile browser acceptance and a Docker build. Those CI checks are not claimed as passed until their remote results are observed.

## Deployment acceptance (not yet run)

1. Verify free service and database plans and workspace zero-cost controls in the dashboard.
2. Supply database connection and bootstrap credentials privately through Render environment configuration.
3. Deploy the same-origin Docker app to a new free service; record its actual deployed commit and URL.
4. Smoke test health, admin login, guest login, forbidden guest Studio access, logout and session invalidation over HTTPS.
5. Verify Secure/HttpOnly session cookie attributes and absence of credentials in assets/logs.
6. Restart/redeploy and verify database persistence.
7. Record deployment outcome separately from local test results. Do not mark deployment green from a successful Git push alone.
