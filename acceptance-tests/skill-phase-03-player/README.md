# Phase 3 player-first refinement

Replaces the dashboard presentation of Inside the machine, not the existing Boot & OS lesson.

- Viewport-sized stage with icon transport and auto-hiding title/control chrome; input/focus reveals controls. Keyboard focus in controls is protected.
- Power starts automatic narration/subtitle-paced progression through startup. Visual cues share the subtitle clock. POST branch, prediction and storage-exploration checkpoints pause for learner choice.
- Short subtitles preserve the full saved caption; voice defaults off, optional speech is bounded and falls back to reading-paced subtitles. Pause/resume replays the current short unit. Hidden tab pauses progress, and stale runs cancel on seek/navigation.
- Information/transcript, scene list, settings and inspection are on-demand drawers. Subject introduction and roadmap are excluded from this chapter's player.
- Compact admin caption actions beside subtitles; authoring pauses and locks playback and opens an overlaid editor. Existing draft/publication permissions and workflow unchanged.
- Native fullscreen, reduced motion, keyboard controls, focus containment and responsive transport wrapping.

Validation: production build/design lint/theme lint passed. Complete browser suite: 126 passed on explicit isolated local SQLite API at 127.0.0.1:8083. Covers automatic progression and pause checkpoints, failure/retry, subtitle completeness, speech failure fallback, fullscreen entry/exit, control reveal, editor permissions, mobile viewport fit, light/dark contrast and existing lessons/auth/Studio regressions. No backend runtime changes, migrations, production test writes or real AI generation calls.

Deliberate limits: conventional PC illustration, not measured hardware timing; short subtitle segments can replay after pause. Portrait phones may wrap subtitles beyond two lines for long words/Tamil; text is never truncated. Legacy Boot & OS remains available until owner review of the new player.
