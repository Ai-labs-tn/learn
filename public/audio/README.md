# Narration recordings (optional)

The whiteboard voice controller prefers a human recording for a beat when the timeline supplies
an `audioSrcEn` or `audioSrcTa`; otherwise it uses the browser voice selected for the caption
language. The fallback is deliberately per-step, so recordings can be added gradually without
changing the lecture engine.

## Naming convention

Put recordings under `public/audio/<track>/<step-id>.<lang>.mp3` (for example:

- `public/audio/boot-os/power.ta.mp3`
- `public/audio/jvm-runtime/minor-gc.ta.mp3`
- `public/audio/dsa/bst-search-40.ta.mp3`

Then set `audioSrcTa: '/audio/boot-os/power.ta.mp3'` on that step. English recordings use `.en.mp3`
and `audioSrcEn`. Keep one beat per file, with a little natural breath at the end. The voice
controller plays the recording to completion before it advances; if the asset fails to load, it
falls back to the browser voice.

## Recording checklist

- Tamil captions use Tamil script; keep technical jargon in English exactly as written in the
  caption (Eden, Metaspace, kernel space, bytecode, etc.).
- Record at a steady seminar pace; don't read punctuation literally.
- Use mono MP3, 44.1 kHz, 96–128 kbps; aim for clear speech, no background music.
- Do not commit any recording until the speaker has explicitly approved its use.
