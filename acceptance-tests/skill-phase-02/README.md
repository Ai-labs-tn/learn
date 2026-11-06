# Skill phase 2 — Inline boot-caption authoring

## Scope
Admin controls directly above the boot whiteboard caption. No Studio/library UI changes, no backend runtime changes, no migration, no production content seeding. Creates `boot-whiteboard` only when an admin first saves. Never modifies the existing `boot-pilot`.

## Local validation
- `npm run build`: design lint, theme lint (49 semantic contrast pairs), TypeScript and production bundle passed.
- `npm run audit:security`: 0 vulnerabilities.
- `.venv/Scripts/python.exe -m pytest backend -q --junitxml=acceptance-tests/skill-phase-02/backend/junit.xml`: 277 passed, 34 PostgreSQL-only skips, one upstream TestClient deprecation warning.
- `LEARN_TEST_BASE_URL=http://127.0.0.1:8083 LEARN_EVIDENCE_DIR=acceptance-tests/skill-phase-02/frontend npx playwright test`: 112 passed (desktop and mobile Chromium). Tests ran against the production build with explicit APP_ENV=test and a disposable SQLite database in the approved local temp directory. No .env.render loading or production DB access.

AI output/status mocked in browser tests; backend provider tests use canned transports. No real AI generation used for this validation.

## Acceptance covered
- All 16 stable step IDs match the bundled English and Tamil source captions.
- Guests see no editor; API authorization and CSRF still protect drafts, publication and AI.
- Saves affect only drafts. Separate review/confirmation publishes and reload reads the persisted text; old pilot stays unchanged.
- AI rewrite comparison/acceptance versus non-applicable fact-check findings; explicit no-live-retrieval advisory labels.
- AI provider failure, cancellation and late response suppression; stale If-Match conflicts retain local text.
- Incompatible saved structures block editing. Per-step/language lock stops scene navigation during authoring.
- Unsaved-anchor/sign-out guards and a single leave confirmation.
- Mobile widths 320/390/1280, light/dark contrast scans and reduced-motion rendering.

## Known limits
Fact-checking is AI advice with bundled contextual notes, not source-grounded verification. No live source retrieval. Existing Java/other tracks are untouched by the caption editor. Active viewers must reload to load a newly published caption revision. Security-driven sign-out/session revocation can still close an editor; save drafts regularly.
