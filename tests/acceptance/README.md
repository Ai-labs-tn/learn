# Browser acceptance tests

Run only against an isolated local API on 127.0.0.1:8000. The Playwright configuration starts the Vite development server and its same-origin `/api` proxy on 127.0.0.1:5173. Do not aim this suite at production.

Provision the isolated database with disposable local account passwords matching `LocalAdmin123!Only` and `LocalGuest123!Only`, or supply TEST_ADMIN_PASSWORD and TEST_GUEST_PASSWORD with matching disposable values. These are test fixtures, not deployed account defaults. Failed fill actions can include their values in Playwright call logs; never use real production passwords here.

```
npx playwright install chromium
npm run test:acceptance
```

The suite runs desktop and mobile Chromium. XML reports and reviewed post-login screenshots are written under `acceptance-tests/phase-01/`. HTML reports and raw browser artifacts remain ignored. Traces and automatic failure screenshots are disabled to reduce accidental credential capture. Review evidence before committing.

Backend unit/integration tests and production HTTPS/PostgreSQL deployment checks are separate requirements; this suite alone does not establish them.
