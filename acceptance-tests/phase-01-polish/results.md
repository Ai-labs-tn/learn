# Phase 1 correction — centralized themes and mobile-first layout

## Implemented

- `src/styles/theme.css` owns all application literal colors, including semantic foreground/background pairs, disabled states and intentional terminal colors. Removed inline theme.json primary overrides that paired a dark blue background with near-black dark-mode text.
- Scoped native button reset fixes the shared theme toggle without editing node_modules. Theme controls are inside the login card header and have 44px targets. Login inputs/submit are 48px tall, with 16px input text, safe-area padding and content-driven height.
- Wrapped lesson titles, warnings, controls and the playground Run button; contained intentional diagram/source scrolling rather than hiding page overflow globally.
- Monaco follows the selected theme. Simulated terminal colors are centralized; JVM terminal heading no longer inherits the wrong light-theme text color. Bytecode inspection cards scroll rather than clip.
- `npm run lint:theme` rejects literal colors outside the central theme file and inline semantic overrides in theme.json, and checks 49 normal-text color pairs at minimum 4.5:1 contrast. Included in the build.

## Local acceptance

- `npm run build`: PASS (design lint, TypeScript, Vite; existing Monaco bundle-size warning).
- `npm run lint:theme`: PASS, 49 semantic color pairs.
- `npm run audit:security`: PASS, zero known vulnerabilities.
- `LEARN_EVIDENCE_DIR=acceptance-tests/phase-01-polish npm run test:acceptance`: **40 passed**, approximately 1.7 minutes.
- Responsive tests include 320x740, 390x844, 768x1024, 1280x800 and 844x390 for light/dark login and all six authenticated screens (five learning tracks plus Studio), with no page-level horizontal overflow.
- Axe color-contrast checks pass on the rendered initial state of each screen in both themes. This is not a claim that every animated state or all accessibility rules were audited.
- Explicit/system preference persistence and OS theme changes, Monaco theme, touch target and input font checks pass. Existing authentication and learning functional regressions also pass.
- Reviewed representative light desktop and dark 320px login screenshots. XML report and screenshots stored alongside this document. No private credentials are included.

## Follow-up boundaries

The fixed-coordinate lesson diagrams still use intentional internal panning on small screens; a full visual/teaching redesign belongs to the animated pilot phase. This correction does not claim to implement lesson editing, AI assistance, or new content APIs. Hosted results are recorded only after deployment is observed.
