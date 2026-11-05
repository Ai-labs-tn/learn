# Phase 4 coordinated playback

Added shared published/draft reader Play/Pause, voice toggle, language-specific browser TTS, reading-paced caption fallback, transcript, run guards and bounded stalled-speech recovery. Pause/replay restarts a beat; edits do not interrupt speech on every keystroke. Browser voices/pronunciation vary and synchronization is beat-level, not word-accurate. No recorded/generated audio or external service is used.

Also repaired V1 voice-off auto-advance, missing speech API startup and Space interception on interactive controls. Reduced-motion behavior is supported.

Local build/design/theme lint/types passed. Full desktop/mobile browser suite: **66 passed**, 4.1 minutes, against the built frontend/current isolated backend. Includes 10 mocked speech-engine cases: speech-active completion guard, stale callbacks after pause, missing Tamil voice without English substitution, missing speech API fallback, V1 muted playback/native keyboard action, and watchdog pause. Actual audible voice quality is not certified by these tests. Raw failure during test development was a fixture issue: V1 silent warm-up counted as narration; isolated story counters before assertions.

No backend changes. Remote CI and actual hosted playback verification must be observed before claiming the release is live.
