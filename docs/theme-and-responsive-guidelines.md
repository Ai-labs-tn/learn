# Theme and responsive UI contract

- App color source: `src/styles/theme.css`, loaded after AGILER themes. Keep each semantic color paired with its foreground and hover/active/soft variants in both light and dark selectors.
- Do not put semantic colors in theme.json: its inline overrides take precedence over mode-specific CSS. Non-color branding such as radius is allowed.
- No literal colors in application components/CSS outside the central theme file. Intentional simulated terminals use centralized terminal tokens in either UI theme.
- `npm run lint:theme` is a build gate and checks centralization plus 49 foreground/background pairs at WCAG AA normal-text contrast (4.5:1). New tokens must get comparable coverage.
- Login is content-sized, not fixed-height. Respect safe areas, at least 16px input text, 48px form controls and 44px theme targets. Theme selection stays in the login card header; no detached viewport corner control.
- Start at 320px. Wrap labels, titles and action rows; use `min-inline-size: 0` on flexible children. Keep source/code/diagram scrolling inside the relevant panel, never mask defects with global horizontal overflow hiding.
- Editors must follow the resolved theme. Preserve system preference and initial pre-paint theme; do not force light during application startup.
- Playwright checks login and all current authenticated screens at five portrait/landscape sizes, both themes, preference reload/OS changes, text contrast, editor theme and no page-level horizontal overflow. Expand that suite when new screens are added.
- Passing automated contrast on an initial lesson state does not certify every animated frame, SVG label, keyboard interaction or screen reader flow. Review representative screenshots and add focused interaction/accessibility tests as features evolve.
