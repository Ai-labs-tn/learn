# Phase 5 — AI-assisted authoring (free models only)

## Delivered

- Server-side OpenRouter integration; the key lives only in the API environment and is never sent to the browser, stored or logged.
- Free-model-only policy: the default model list is zero-cost, verified against the live provider catalogue at startup; configuring an unknown or non-free model fails startup.
- Admin-only `POST /api/studio/ai/assist` (CSRF/origin protected) with seven advisory modes — improve, review, translate to Tamil, shorten, visual suggestions, storyboard, checkpoint — returning plain-text suggestions only. Nothing is applied server-side; the admin accepts, edits or discards.
- `GET /api/studio/ai/status` reports enabled state, models and the remaining daily budget. Missing key disables the feature (503 on assist) — never fail-open.
- Workspace daily budget (default 100) enforced atomically in an additive `ai_usage` migration; usage rows record mode/model/status/sizes only — no prompts, responses or credentials.
- Provider failover across the ordered free-model list (402/429/404), single attempt per model, strict output validation; over-length or markup-bearing output is rejected, never truncated.
- Studio UI: AI panel with remaining-budget status, per-beat and per-scene assist buttons, plain-text suggestion region showing model and request ID, Apply (local draft edit only)/Discard, explicit 503/429/502/422 error handling, one in-flight request guard, and full mobile/theme compliance.

## Verification

- Backend: 241 passed, 33 skipped (disposable PostgreSQL opt-in), 1 existing third-party warning. All AI tests use a mocked provider transport — no real provider calls in the suite.
- One real end-to-end live smoke against OpenRouter with the production key on a free model succeeded after automatic failover (`nvidia/nemotron-3-ultra-550b-a55b:free`); see `live-assist-smoke.json`. No suggestion text or key material is included in evidence.
- Full desktop/mobile browser suite: **72 passed** (71 in the first run plus one timing-flake re-verified after widening its assertion timeout). Includes AI apply/discard isolation, guest denial, disabled/budget/provider-failure states, plus all prior phases' regressions.
- Build, design lint, theme lint (49 contrast pairs), typecheck and security audit all pass.

## Boundaries

- Suggestions are advisory text only; AI never saves, publishes or restores lessons.
- Free-tier models are rate-limited and variable in quality; outputs remain subject to admin review and the same lesson validation on save.
- CI runs without a provider key (AI disabled there; browser tests mock the endpoints), so no credentials exist in CI.
- Hosted deployment and one hosted live assist check remain to be observed before claiming the release is live.
