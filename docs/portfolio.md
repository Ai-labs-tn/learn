# Public portfolio landing page

The landing page for https://learn-with-saravana.onrender.com/ is a public, animated portfolio built from the owner's resume. Logging in is a link in the top-right corner (`#/login`). After logout or session expiry visitors return to the portfolio, with a dismissible notice explaining why.

## Data flow

```
resume PDF ──pypdf──▶ classified entities ──ground-check vs PDF text──▶ profile-build/entities.json (private)
                                   │
                                   ├─▶ AI narration (public-safe fields only) ──▶ profile-build/narration.json
                                   ▼
        admin API  POST/PUT /api/studio/profile  ──▶  `profiles` table (id, entities JSON, version, is_public)
                                   │
              public API  GET /api/profile  ──▶ public projection only (privacy flags honored)
                                   │
                    scripts/profile_pipeline.py snapshot ──▶ src/portfolio/profile.snapshot.json (bundled)
```

* `scripts/profile_pipeline.py` has the subcommands `extract`, `narrate`, `push`, `snapshot`, `check-privacy`. It never connects to a database; `push` uses the admin HTTP API with an explicit password environment variable.
* Entity kinds: identity, contact, summary, highlights, skills, certifications, awards, experience, education, projects, domains, references, narration, privacy. Everything extracted is stored; the public projection decides what is shown.
* **Privacy defaults:** the public API and the bundled snapshot exclude the phone number, home address, references and school-level education by default. The admin can opt in using `privacy` (`showPhone`, `showAddress`, `showReferences`, `showSchoolEducation`) through `PUT /api/studio/profile`. The bundled snapshot is public and remains in deployed assets and Git history: changing API privacy flags cannot retract previously published snapshot data. Review the public projection before generating or committing a snapshot. `check-privacy` checks the default projection for private contact and reference values.
* The current preview uses the resume summary; AI narration has not yet been generated. When narration is run, only public-safe fields (no contact details or references) are sent to the AI provider.
* **Fast first paint:** the page renders from the bundled snapshot immediately and then refreshes from `/api/profile` with an 8-second timeout. A sleeping free-tier API therefore never blocks or blanks the landing page.
* The profile photo is the image embedded in the resume PDF (211x316), stored at `public/portfolio/avatar.jpg`.
* Skill levels are drawn as dots in the PDF and are not in its text layer; they were read from the rendered page and are editable.

## Theme and motion

* The existing `ThemeProvider` persists the light/dark/system choice in `localStorage` (`agiler.theme`); the portfolio, login and every app screen use the same provider and the same toggle.
* All colors come from `src/styles/theme.css` tokens (the build's `lint:theme` gate rejects literals).
* 3D effects use CSS transforms and small hooks only (no animation library). `prefers-reduced-motion` disables parallax, orbiting, flips and count-ups, leaving a flat, fully visible layout.
