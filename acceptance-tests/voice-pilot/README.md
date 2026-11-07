# Browser voice pilot

## Scope
Shared learning player settings now provide a browser voice list, 0.85× speed and an explicit voice sample. English and Tamil voice choices are saved separately; old settings are preserved. The voice catalogue updates when `voiceschanged` fires and briefly polls for browsers that load voices later. Automatic selection prefers a browser voice labelled Natural/Neural when available, then the browser default for that language. A missing selected voice falls back with a warning; Tamil does not fall back to an English voice.

Narration units are grouped around sentence boundaries with a 125-character target rather than the earlier 64-character target; text is preserved. This can reduce abrupt cuts but does not guarantee a human-sounding voice. An editor can still change scene captions through the existing draft/publish workflow; this pilot does not rewrite or publish content. The sample is prewritten, not recorded or AI-generated. No new app-side audio service is called. Browser/OS voices may be local or may use a network service, depending on the provider.

## Local validation
- `npm run build`: design lint, theme lint (49 semantic contrast pairs), TypeScript and Vite build passed.
- `npm run audit:security`: zero vulnerabilities.
- `python -m pytest backend -q`: 277 passed, 34 PostgreSQL-dependent skips; one existing Starlette deprecation warning. CI runs PostgreSQL tests.
- `npx playwright test`: 144 passed, desktop/mobile Chromium, explicit isolated SQLite API on 127.0.0.1:8093. Evidence in frontend/browser-results.xml.
- Mock browser speech verifies async voiceschanged, selection persistence across modules, separate English/Tamil selections, 0.85× actual utterance rate, explicit preview, cancellation and missing Tamil fallback. Full playback, authentication and caption regression suites passed.
- Tests did not load `.env.render`, call OpenRouter, use an external TTS provider or write production data. Browser TTS sound quality remains subjective and must be reviewed in the owner's browser; automated tests check behavior, not expressiveness or perfect timing.

## Next design review
`docs/reach-the-desktop-storyboard.md` is a proposal for owner approval. No replacement animation, hosted narration recording, voice cloning or new provider is included in this pilot.
