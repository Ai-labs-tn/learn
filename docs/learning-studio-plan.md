# Learning Studio implementation plan

## Goal and agreed direction

Preserve V1's interactive visual teaching with narration and captions while introducing professional scene choreography and an authenticated authoring studio. Editable lesson content must be publishable without rebuilding the frontend. Implement incrementally; preserve current learning tracks during migration.

## Access model

Initial accounts: `admin` (administrator) and `guest` (read-only learner). Passwords are configured privately during setup, not committed or bundled into the frontend. If literal admin/admin and guest/guest credentials are wanted for local demonstrations, allow them only in an explicitly enabled local demo environment; do not deploy them publicly.

Assumption for the initial release: login is required for both roles; anonymous users see the login screen. Guest can navigate lessons, play narration, change language, and use existing local simulations/playground. Read-only means no changes to shared published content, not disabling learning interactions.

| Capability | Guest | Admin |
| --- | --- | --- |
| Read published lessons and use learning controls | Yes | Yes |
| Read drafts, access Studio and preview unpublished changes | No | Yes |
| Create/edit drafts, request AI assistance | No | Yes |
| Publish or restore a previous published revision | No | Yes |

Backend endpoints enforce these rules independently of frontend navigation. Never trust a role submitted by the browser.

## Architecture

- Keep React, TypeScript, Vite and AGILER application chrome.
- Extend the existing FastAPI service rather than adding a second backend stack.
- Use PostgreSQL for users, sessions, lesson drafts, published revisions and audit events; introduce actual migrations rather than extending the generic feature tables as content models.
- Store versioned, validated lesson data (not executable JavaScript). Reference only registered scene components and supported actions.
- Keep simulation truth, visual rendering and lesson choreography separate.
- Prefer React/SVG for diagrams. Evaluate GSAP with one seekable pilot before committing broadly; avoid competing animation clocks.
- Browser TTS provides initial narration and fast previews. Future recorded/generated audio can use the same content model.
- Prefer a same-origin `/api` deployment for secure cookies. Confirm hosting topology before authentication implementation. A single FastAPI service serving the built frontend and API is the initial simple option; a split deployment needs deliberate cookie, CORS and CSRF configuration.

## Phase 1 — Secure admin and guest foundation

1. Add backend settings and migrations; provision admin and guest with password hashes through an explicit bootstrap command and private environment input.
2. Replace predictable demo tokens with cryptographically random, expiring server-side sessions. Store session-token digests in the database; use HttpOnly cookies, Secure in production, appropriate SameSite settings and CSRF protection for state-changing requests.
3. Implement login, current-user and logout endpoints plus reusable authenticated/admin dependencies.
4. Disable or replace the existing demo OTP/password-reset flows so they cannot bypass the new access model. Do not expose development code echo in production.
5. Add login throttling, generic invalid-credentials messages and secret-safe logging. Validate required configuration at startup.
6. Add frontend session loading, login/logout, role-aware navigation and an admin-only Studio placeholder. Avoid storing session credentials in localStorage.
7. Establish local frontend/API development routing and production deployment configuration.

Acceptance:
- Both accounts can log in; session survives refresh and logout invalidates it.
- Unauthenticated API requests return 401; guest write/Studio requests return 403, including direct HTTP calls.
- Admin can access the Studio placeholder. Guest can continue all current learning interactions.
- Passwords are hashed; secrets are absent from source and frontend bundles.
- Tests cover expiration, logout, incorrect credentials, permission checks and CSRF behavior.

## Phase 2 — Versioned lesson content and read API

1. Define a versioned lesson schema: stable lesson/scene/beat IDs, metadata, English/Tamil narration, optional caption overrides, registered visual actions, checkpoints and initial scene state.
2. Add separate migration-managed models for users, sessions, lessons, mutable drafts, immutable revisions and audit events. Track a lesson's current published revision explicitly.
3. Import one Boot & OS pilot from current authored content; use an idempotent import, not an automatic overwrite at each startup.
4. Provide guest-readable published-content endpoints and admin-only draft endpoints.
5. Add optimistic concurrency (draft revision/ETag) to prevent overwriting edits from another tab.
6. Have the pilot route load published content while other tracks remain unchanged. Surface loading and error states without silently replacing published content with an outdated local lesson.

Acceptance:
- Content survives backend restart.
- Guest cannot obtain drafts through API routes or predictable revision IDs.
- Content validates against supported components/actions; unknown schema versions fail clearly.
- Existing non-migrated tracks continue to function.

## Phase 3 — Minimal Lesson Studio and publication

1. Build an admin editor for scene/beat order, narration, captions and approved visual actions. Start with forms, not a full drag-and-drop timeline editor.
2. Add English/Tamil editing and explicit caption overrides; default captions to narration text to minimize drift.
3. Add draft save status, conflict handling and unsaved-change warnings.
4. Provide preview using the same lesson renderer as learners, with draft data available only to admin.
5. Publish transactionally: validate and create an immutable revision, update the published pointer and append an audit event.
6. Add version history and restore-as-draft, followed by explicit publishing.
7. Pin each active learning session to its loaded revision. New sessions receive the new publication; running lessons are not hot-swapped. Ensure published content is revalidated rather than indefinitely cached.

Acceptance:
- Admin can edit, preview and publish a narration change without frontend deployment.
- Saving a draft never changes the learner-visible publication.
- Guest cannot edit, publish, restore or access draft preview.
- Concurrent saves surface a conflict; publication and restore history remain inspectable.

## Phase 4 — Beat-based narration and coordinated playback

1. Split scenes into short narration beats with semantic visual cues rather than hard-coded sentence-duration estimates.
2. Coordinate each beat's speech and visual sequence; advance after both complete. Include bounded recovery and a manual continue path for speech errors or missing completion events.
3. Cancel stale speech/animations on stop, navigation, language change and replay. Guard callbacks with a run identifier.
4. Editing a draft does not interrupt speech on every keystroke. Replay uses the latest saved/preview text and starts a clean run.
5. Add language-specific content, voice selection and clear unsupported-voice messaging; never silently read Tamil in an unrelated voice.
6. Provide text-only/muted playback, reduced-motion support and accessible captions/transcript.

Browser TTS limitations: no dependable seekable audio clock, variable voices and pronunciation, and inconsistent boundary/pause behavior across devices. Promise beat-level coordination, not frame-perfect word synchronization. With future audio assets, derive visuals/captions from actual media position and maintain language-specific cue timings.

Acceptance:
- Edited text is spoken on the next preview without rebuilding or generating an audio file.
- Next/previous/replay does not leak old speech or callbacks.
- Missing Tamil voices and speech failures have usable fallback states.
- Pause/resume behavior is documented and tested in supported browsers; restart the beat when necessary.

## Phase 5 — AI-assisted authoring

1. Add admin-only backend AI endpoints; keep OpenRouter credentials exclusively on the server.
2. Start with clarity improvements, technical review, translation, storyboarding, visual-action suggestions and checkpoint drafting.
3. Return structured suggestions/diffs; require explicit admin acceptance. AI never automatically publishes.
4. Validate outputs against the schema and action registry. Treat lesson text and model outputs as untrusted data, never executable code.
5. Add request-size limits, throttling, timeouts and configurable spend limits. Document what content is sent to the provider.
6. Evaluate available models using real English/Tamil lesson examples before choosing defaults. Record model/prompt provenance where useful without storing secrets.

Acceptance:
- Guest cannot invoke AI endpoints.
- Provider failures do not destroy drafts.
- Invalid output cannot enter a publication.
- Admin can accept or discard suggestions before saving/publishing.

## Phase 6 — Professional animated pilot

Produce a 60–90 second power-on/firmware/POST explanation.

1. Approve the technical script and storyboard first.
2. Define readable visual frames and a small visual vocabulary: focus, signal transfer, state change, memory regions and checkpoint.
3. Build React/SVG components and a deterministic scene renderer that can reconstruct a beat without relying on previous animation side effects.
4. Prototype seek/replay behavior with the selected animation library; ensure one owner controls choreography.
5. Add mobile layouts, reduced-motion behavior, transcript and one prediction checkpoint.
6. Review accuracy: distinguish illustrative concepts from literal hardware behavior.

Acceptance:
- Narration references the visible action clearly; labels are readable on mobile.
- Beat navigation and replay reliably reconstruct state.
- Learners can explain what POST does and whether the OS has loaded.
- Approved pilot patterns become reusable building blocks before migrating other tracks.

## Phase 7 — Expand and polish

- Migrate remaining boot scenes, JVM, bytecode and DSA incrementally.
- Preserve the Java parser/compiler/interpreter and map its results to shared visual components rather than replacing it with scripted video.
- Add optional generated/recorded narration, asset storage and alignment. Mark audio/cue data stale when its source script changes and prevent accidental mismatched publication.
- Later consider video export via Remotion, selected Manim scenes, individual learner accounts and progress tracking.

## Validation and release discipline

- Preserve existing design-lint and TypeScript/build checks.
- Add backend auth/content/permission tests with explicitly declared test dependencies.
- Add frontend tests for schema, playback/run cancellation and editor behavior; browser tests for login, guest denial, edit-preview-publish and reload persistence.
- Test English/Tamil availability and voice-off behavior on supported browsers, plus desktop/mobile and reduced motion.
- Back up PostgreSQL, use additive migrations, document deployment/rollback and test restore procedures.
- Each phase is a reviewable implementation slice. Do not rewrite all tracks, build a full visual editor or integrate AI/video services before validating the foundation.

## Execution approval and constraints

The owner approved implementing phases sequentially, with functional tests, lint/build checks, acceptance evidence, and commits/deployments only after green checks. Stop for decisions/blockers and attempt a local audible notification.

Hosting approval: **Render free tiers only** for every deployed resource. Never provision a paid plan or upgrade. Verify usage/spend controls; free instance selection alone does not eliminate possible usage charges. Render documentation currently states free PostgreSQL expires after 30 days and has no managed backups.

Protect the existing static V1 deployment. A separate same-origin free Docker app plus free PostgreSQL is the proposed preview deployment; its live setup requires authenticated Render access. Do not push the login-dependent frontend to the current static site's auto-deployed main branch before the API is deployed and verified.

## Immediate next step

Implement and test Phase 1, then pass the Render deployment gate before treating it as deployed and advancing the release sequence. Private initial passwords and deployment authentication must never be committed.
