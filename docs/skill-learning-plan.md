# Skill-first learning journey

Owner approved incremental implementation on 2026-11-06. This plan supersedes the navigation direction in the original Learning Studio plan; it does not authorise further Lesson Library/Studio development or cleanup.

## Phase 1 — Skill navigation (implemented, locally validated)

Nine primary skill areas: Computer Basics; Core Java Internals; Advanced Java — Spring Boot & JPA; GCP; AI & ML; SQL / Geospatial; Python & FastAPI; Angular; React.

- Computer Basics contains the existing Boot & OS scene.
- Core Java Internals contains JVM runtime, Bytecode stepper, Java playground and DSA.
- Other areas explicitly show planned topics, not working lessons or fake Run/AI buttons.
- Subject/chapter routes use `#/skills/<skill>/<chapter>`; old demo bookmarks still work and highlight the correct parent subject. Login defaults to Computer Basics.
- Lesson Library and Studio remain unchanged under Existing tools; server authorisation remains unchanged.
- Existing Java playground is an educational subset compiler/interpreter, not a full JDK. No new execution infrastructure or AI requests in this phase.
- Corrected the previous session-banner fix's stale closure: background 401 handling now uses current session state, preserving logout notices without inventing expiry for anonymous visitors.

Evidence: `acceptance-tests/skill-phase-01/`. Production build/design lint/theme lint pass. Complete browser suite: 92 passed. Backend: 274 passed, 33 skipped (PostgreSQL unavailable locally; CI supplies PostgreSQL). Tests used explicit isolated SQLite settings on localhost, no production database or OpenRouter calls.

## Phase 2 — Inline caption authoring (implemented, locally validated)

Admin-only Edit / Rewrite / AI fact-check controls above the current scene's caption. Pause playback while editing; address the current scene/beat and language explicitly. Compare original/suggestion; require acceptance. Reuse existing versioned storage and authorisation behind the scenes without extending Studio. Save draft and explicit publication must remain distinct. Handle conflicts, cancellation, provider failure, stale responses and unsaved edits. Guests cannot read drafts or invoke writes/AI directly.

Implemented on the 16-step Boot & OS whiteboard, in both English and Tamil. Controls sit immediately above the active caption and are provided only by the authenticated admin context. Opening a control loads the editor first; an AI call requires an explicit action inside it. No automatic AI calls, saves or publication.

Storage reuses the existing lesson draft/revision/audit endpoints under the separate ID `boot-whiteboard`. This draft is created only on the first Save, not by viewing the scene or opening the editor. The existing 8-beat `boot-pilot` is never overwritten. As ordinary lesson content, the new record can also appear in the existing Studio/library listings; their UI has not been extended or changed. Caption/narration stay synchronized per language. Incompatible structural edits and divergent caption overrides block inline editing rather than silently removing content.

Save draft and publication are distinct. Publication review shows all saved text differences across this boot lesson; explicit confirmation publishes the entire saved draft with If-Match protection. Active readers remain pinned; reload loads the new caption revision. Until a first publication exists, the original bundled text is used. Other load failures show an explicit baseline warning.

Fact-checking is advisory technical review using the supplied caption, scene context and bundled PC/UEFI notes. The UI links reference documentation and explicitly says there is **no live source retrieval** and no guarantee of factual verification. Review findings cannot be applied as caption text; rewrites require explicit acceptance into the editor. Free-model credentials, budgets and permissions remain server-side.

Evidence: `acceptance-tests/skill-phase-02/`. Production build/design lint/theme lint pass; security audit reports zero vulnerabilities. Full browser suite: 112 passed, including real local persistence/publication, English/Tamil isolation, guest/API denial, AI failures, stale response cancellation, conflicts, unsaved-navigation/sign-out guards, reduced motion and light/dark contrast. Backend: 277 passed, 34 skipped (PostgreSQL-only checks run in CI). All functional tests used isolated local data and mocked AI; no production test data or paid/provider calls were created.

## Phase 3 — Computer Basics animated pilot

Resume the previously deferred Phase 6 power-on → firmware → POST animation only after the inline workflow is validated. Approve script/storyboard; distinguish illustrative scenes from literal hardware. Test replay, mobile, reduced motion, English/Tamil captions and cancellation.

## Phase 4 — Expand skill areas incrementally

One complete lesson at a time: plain explanation → interactive scene → appropriate exercise/editor → actual results → AI review. Include approved personal experience without confidential project information. Choose isolated execution per technology; no arbitrary user code on the application server, no cloud deployments with production credentials. Free-tier feasibility/quotas and any external runner need review before implementation. Clearly separate simulated results, real compiler/runtime results and AI advice. Never present AI output as compilation or proof of correctness.

## Release gates

Each phase is separately reviewable. Run tests, design/theme lint and production build before committing/pushing. Preserve public portfolio/authentication and existing demos. Do not expand Lesson Library or Studio. Keep private resumes, secrets, local databases and unrelated evidence out of commits.
