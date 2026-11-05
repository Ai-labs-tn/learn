# Render deployment — existing Learn UI, free API and isolated database

## Approved topology (2026-11-05)

- Existing project **Learn**, environment **production**.
- Existing static UI **learn-with-saravana** (`srv-dbl9dkqjnfac73f9oalg`), https://learn-with-saravana.onrender.com.
- Free Python API **learn-with-saravana-api** (`srv-dblvaktbedkc73anbj4g`), https://learn-with-saravana-api.onrender.com.
- The UI rewrites `/api/*` to the API without redirecting the browser. Hosted POST bodies, Origin, session cookies and CSRF have been verified through this path.
- PostgreSQL uses **learn_studio**, with restricted login **learn_studio_app**, on the existing free **agiler-pg-pp** instance. The owner explicitly approved isolated reuse because Render permits only one free PostgreSQL instance per workspace. The physical instance stays in Agiler; do not move, delete, upgrade or manage it from Learn's Blueprint.
- Owner accepts possible bandwidth/build overages. **Paid compute/database plans remain forbidden.** No shared billing settings were changed.

## Isolation and credentials

The new application role is not a superuser, cannot create databases/roles and cannot bypass RLS. It has CONNECT on its database and USAGE/CREATE on its own public schema, where Learn's migrations create its tables. Public access to the Learn database/schema was revoked. Read-only privilege inspection verified this role has no SELECT/INSERT/UPDATE/DELETE access to Agiler's existing application tables. No Agiler application rows were read or changed.

Generated initial admin/guest passwords and the restricted database URL are configured privately on the API. An ignored local `.env.render` contains the generated values for the owner/operator; never publish it or capture it in evidence. The shared instance's administrative connection string is not used by the Learn service. Password changes require a reviewed account/session rotation procedure; changing bootstrap environment values does not reset existing accounts.

## Build and release

`render.yaml` preserves the existing static service and declares the free API in the same project. Both target `main`, with auto-deploy after CI passes. The former separate-preview Blueprint was removed. Never deploy the login-dependent UI without a working same-origin API rewrite.

CI covers real disposable PostgreSQL, backend auth/concurrency, browser flows, design lint, TypeScript, npm audit and Docker build. Hosted smoke checks are separately recorded under `acceptance-tests/phase-01/`. The opt-in `scripts/verify-hosted-phase1.py` uses private generated credentials, emits no secrets and checks the deployed API through the static UI hostname. It must not be run repeatedly enough to trigger login throttles.

Keep startup migrations additive and backward-compatible because UI and API deploy independently. Re-run hosted UI smoke checks after release. A successful Git push or build is not evidence of a healthy hosted application.

## Free-tier limitations

Source: https://render.com/docs/free (verified 2026-11-05).

- The reused free PostgreSQL instance expires 30 days after its **original** creation, not 30 days after adding Learn. It was already approximately 22 days old at inspection. Creating a new logical database does not extend this deadline. Free PostgreSQL has no managed backups.
- Export the Learn database/content before expiry and coordinate with the Agiler owner; never automatically upgrade or recreate the shared instance.
- Storage/CPU/connection limits are shared with Agiler. Keep connection pools and tests bounded; never run destructive acceptance fixtures against this shared instance.
- Free API sleeps after 15 idle minutes; cold start may take around a minute. Do not generate keepalive traffic to evade this.
- Filesystems are ephemeral. No hosted SQLite or persistent paid disks.
- Free instance hours, bandwidth and build allowances are limited. The owner has accepted overage risk, not paid plan upgrades.

## Proxy/IP caveat

Session and origin/CSRF checks have been verified through the Render static rewrite. Per-IP throttle attribution behind multiple proxies still needs a verified trusted proxy configuration; do not blindly trust arbitrary forwarded headers. The default account-based throttle is also enforced server-side. No anonymous diagnostic endpoint exposing client networking metadata is added.
