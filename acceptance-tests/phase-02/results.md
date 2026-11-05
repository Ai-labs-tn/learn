# Phase 2 — Persisted, versioned lesson content

## Delivered

- Additive migration 0003_lesson_content for lesson metadata, mutable drafts, immutable published revisions and append-only audit. Referential constraints keep draft/publication pointers in the same lesson; database triggers protect history from accidental mutation.
- Strict bilingual v1 data schema, bounded content, stable unique IDs and a fixed visual/action registry. No executable content or content-provided asset URLs.
- Published APIs require login; draft APIs require admin. Draft saves also require CSRF/origin checks and quoted If-Match versions, using an atomic conditional update.
- Idempotent boot-pilot import before readiness; edited publications/drafts are never replaced on restart. Export CLI supports private content backup before the shared free PostgreSQL expiry.
- New Lesson library route reads the real published pilot, renders registered conceptual visuals and English/Tamil captions, supports manual beat navigation, and pins the publication during a visit. Existing five learning tracks remain unchanged.

## Local verification

- Backend report: 144 passed, 18 skipped (live disposable PostgreSQL not available locally), 1 pre-existing TestClient deprecation warning. See backend/summary.md and JUnit report.
- Built frontend against fresh isolated current-code FastAPI server on port 8020: **48 browser tests passed**, 1.5 minutes, desktop/mobile Chromium.
- Covers actual persisted publication rendering/refresh and guest draft denial, plus mocked malformed payload/pinning/bilingual controls, all existing auth/learning regressions, and light/dark responsive/contrast checks including the new library.
- Build/design lint/theme lint/TypeScript: PASS. Centralized theme lint remains at 49 paired colors.
- No shared/live database was used for local acceptance. All test credentials are disposable fixtures; screenshots and reports contain no private credentials.

## Release boundaries

Phase 2 does not expose an editor, publishing/history UI, AI features or synchronized narration. Current library displays the single imported pilot; richer library organization is later work. Studio remains the explicit Phase 1 placeholder until Phase 3. Remote PostgreSQL/Docker CI and actual Render deployment are reported separately after their results are observed.
