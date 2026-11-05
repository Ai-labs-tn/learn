# Phase 3 — Admin Lesson Studio

## Implemented

- Admin-only creation of unpublished lessons, metadata/script/caption editing in English and Tamil, stable scene/beat add/remove/reorder, and registered visual action/path/focus/status selectors.
- Private draft preview uses the same reader as published lessons and is explicitly labeled not published. Reader supports choosing among published lessons.
- Strong ETag draft saves, saved-only confirmed publication, revision history and confirmed restore-to-draft. Restoring never silently changes published content.
- Create/save/publish/restore are server-authorized with CSRF/origin checks; shared atomic draft version claims prevent concurrent save/publish/restore overwrites. Immutable revision/audit protections retained; no migration needed.
- Conflict UI retains local changes, disables writes and requires explicit reload. Dirty navigation protection and request guards added. Background connectivity/access rechecks retain unsaved text; write controls are disabled while Studio access is unverified.

## Final local verification

- Full backend suite: **159 passed, 33 skipped**, 1 existing third-party TestClient warning, 197.43 seconds. Skips require disposable PostgreSQL; CI must exercise those separately.
- Built frontend against fresh isolated current-code backend on port 8030: **56 desktop/mobile browser tests passed**, 3.4 minutes.
- Browser coverage includes create -> save -> private preview -> publish -> edit/publish -> restore older revision as draft (publication remains newer), stale save conflict, registered scene/beat editing, and temporary network failure preservation/recovery.
- Existing authentication/learning/content regressions and all-screen light/dark responsive/contrast checks pass, including the expanded Studio.
- Build/design/theme lint/TypeScript passed; existing Monaco large-bundle warning remains non-blocking. Theme guard retains 49 paired colors.

## Issues caught during testing

- Replaced label-text selectors for wrapped textarea/select controls with accessible-role/name selectors; actual rendered form names are correct.
- Hardened background session/Studio revalidation so temporary network failures do not unmount the editor and discard unsaved text. Verified by explicit failure/recovery test.

## Release boundary

All write-cycle tests used isolated local databases and disposable credentials. No acceptance content was published to the shared hosted database. Remote PostgreSQL/CI and hosted read-only editor verification are recorded after observation. AI authoring and synchronized narration are not part of this phase.
