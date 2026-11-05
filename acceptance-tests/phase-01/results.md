# Phase 1 — Secure admin/guest foundation

Date: 2026-11-05. Branch: `learning-studio` (keeps the existing main-branch V1 static deployment unchanged).

## Implemented

- Database-backed admin/guest accounts provisioned privately, scrypt password hashing, opaque expiring sessions, HttpOnly cookies and production Secure cookie policy.
- Origin and CSRF protection, persistent login throttling, bounded independent cleanup, additive Alembic migrations and server-side role dependencies.
- Disabled legacy demo OTP/reset bypasses; authenticated feature API placeholders.
- Session bootstrap, login/logout, admin Studio placeholder, guest denial, cross-tab/focus revalidation and error recovery. Focus revalidation preserves the current lesson step.
- Mobile lesson titles remain visible. Existing tracks and local Java simulation remain usable by guests.
- Separate free-only Render preview Blueprint, same-origin Docker packaging and CI acceptance workflow. Neither existing Render service nor billing configuration was changed.

## Final local results

| Command / scope | Result |
| --- | --- |
| `python -m pytest backend -q --junitxml=acceptance-tests/phase-01/backend/junit.xml` (venv Python) | 84 passed, 9 skipped, 1 third-party TestClient deprecation warning; 61.45 seconds. Skips require disposable PostgreSQL. |
| `npm run test:acceptance` against current backend via Vite | 30 passed; desktop and mobile Chromium, approximately 1.1 minutes. |
| `LEARN_TEST_BASE_URL=http://127.0.0.1:8001 npm run test:acceptance` against current FastAPI-served production build | 30 passed; desktop and mobile Chromium, 48.1 seconds. |
| `npm run build` | PASS: design lint, TypeScript and production build. Existing Monaco chunk-size warning only. |
| Clean temporary workspace `npm ci --include=dev` followed by `npm run build` | PASS, with public GitHub HTTPS transport for UI dependency. |
| `npm run audit:security` | PASS, zero known vulnerabilities after patched DOMPurify override. |
| Backend `pip check` / `compileall` | PASS (see backend evidence). |
| `git diff --check` | PASS. |

Machine-readable XML and reviewed post-login desktop/mobile screenshots are stored beside this report and under `built/`. Raw HTML reports/traces remain ignored. Only disposable local test credentials were used.

## Issues caught during verification

- Initial playground assertion expected the curated whiteboard's button label. Inspection confirmed actual compilation succeeded; corrected the test to assert generated micro-step counts and execute the playground's own Next control.
- Security review prompted recursive Docker secret/database exclusions, a writable non-root local data directory, strict usernames, IP-first throttling and contention-safe cleanup with an indexed additive migration.
- Initial server replacement failed because Windows Python launcher children retained ports. Stopped only the identified test process trees and re-ran both browser suites against newly started current-code servers. Earlier passing runs were not substituted for these final checks.

## Release gates, not yet passed

- Live PostgreSQL integration and concurrency, and Linux Docker build: CI configured, remote outcome not yet observed.
- Render dashboard access is now available, but free resource availability, workspace usage/spending protections and production proxy configuration must be verified before deployment.
- Actual hosted HTTPS cookie behavior, database connectivity/persistence, deployment health and production smoke tests remain unverified.
- Free PostgreSQL expires in 30 days and has no managed backups; never auto-upgrade to paid.

This is Phase 1 only. Lesson editing, publishing, AI authoring and professional animation are intentionally not claimed as implemented.
