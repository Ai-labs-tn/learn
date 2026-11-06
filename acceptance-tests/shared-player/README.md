# Shared learning player and approved machine journeys

## Implemented
- `src/player/ScenePlayer.tsx` owns the icon transport, fading controls, subtitle area, fullscreen, drawers, keyboard navigation and authoring overlay.
- `usePlayerController` shares UI lifecycle; `useGuidedPlayback` shares subtitle/narration timing; `SnapshotPlayer` adapts deterministic domain snapshots without replacing simulation logic.
- Hardware, JVM, curated bytecode, DSA, compiled playground traces and the new machine journeys use the same player.
- Language, narration, subtitles and playback speed share one validated browser preference store, with legacy preference initialization, storage-event support and safe storage failure fallback. Play state/position are not shared.
- Computer Basics defaults to Inside the machine. Legacy Boot & OS is omitted from navigation but both old URL forms remain functional. Library/Studio UI is unchanged.
- New approved stories: desktop-startup (6 scenes, UEFI/Linux-specific), chrome-launch (6 scenes, local blank page only), java-machine (8 scenes, semantic JVM/heap/frames/shared-state views).
- The new stories retain the physical machine and add explicitly labeled software overlays. English/Tamil narration is versioned through isolated lesson IDs on first explicit admin Save; no content is seeded automatically on production. Their captions reuse the existing inline AI/draft/publication workflow.

## Validation
- Production build, design lint and theme lint passed; npm security audit: zero vulnerabilities.
- Full browser suite: 136 passed, desktop/mobile Chromium, built app on isolated SQLite API 127.0.0.1:8083. Includes cross-module/reload preference persistence, default/legacy routes, subject navigation, interpreter trace stepping, language isolation, mobile fit and light/dark contrast.
- Targeted backend content/caption regression: 63 passed, 10 PostgreSQL-only skips. Full PostgreSQL checks are supplied by CI.
- Exported all three new lesson documents and validated them with the backend LessonDocument model: 6/6/8 beats accepted.
- Review screenshots: frontend/screenshots/{desktop-startup,chrome-launch,java-machine}.png.
- No real AI generation, production test-data writes, external network demonstration or new infrastructure in these tests.

## Boundaries
The new journeys are narrated conceptual snapshots, not OS/browser/JVM emulators or measured electrical timing. The existing Java subset compiler/interpreter remains the actual editable execution workbench; its trace is presented through the shared player. The Linux startup is not presented as universal to Windows or every firmware platform. Java diagrams explain semantics, not guaranteed optimized physical object placement. Networking was not explicitly approved in the last checklist and remains deferred. Empty skill areas remain honest roadmaps, not fake working modules. The hidden legacy whiteboard retains its original UI; Studio/library remain frozen.
