# Hosted Phase 1 release — 2026-11-05

Released commit e559f00 on main. Existing UI: https://learn-with-saravana.onrender.com. Free API: https://learn-with-saravana-api.onrender.com, service srv-dblvaktbedkc73anbj4g in Learn/production.

Branch CI https://github.com/Ai-labs-tn/learn/actions/runs/41961578430 and main CI https://github.com/Ai-labs-tn/learn/actions/runs/41961944607 both passed. Includes live disposable PostgreSQL backend tests, desktop/mobile acceptance, lint, types, audit and Docker build.

Hosted verification passed: API health, same-origin static rewrite, admin/guest POST login, host-only Secure/HttpOnly/SameSite cookies, subsequent authenticated requests, no-store responses, guest Studio denial, CSRF/origin rejection, valid logout, revoked-cookie replay rejection, disabled demo OTP, PostgreSQL migration persistence and restricted role capabilities. See hosted-api-results.json.

Real browser verification against the deployed existing UI passed admin login/verified Studio/logout and guest login/Studio denial/logout. Screenshots: hosted-admin.png and hosted-guest.png. Initial credentials are generated and available only in ignored local .env.render and private Render API environment values. No credentials are included in evidence.

Read-only privilege inspection confirms zero Agiler application tables accessible by the Learn role. Physical PostgreSQL remains the existing free Agiler instance, with its original approximately 30-day expiry (already ~22 days old when reused). No paid compute/database plan or shared billing setting was selected/changed.

Remaining: configure/verify trusted proxy IP attribution, backup/export before shared instance expiry, and later lesson-content/Studio/playback/AI/pilot phases. Phase 1 Studio is explicitly a placeholder, not an implemented editor.
