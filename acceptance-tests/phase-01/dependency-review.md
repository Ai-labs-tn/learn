# Dependency security review

The initial npm audit reported a critical DOMPurify advisory through Monaco's pinned DOMPurify 3.4.15 dependency, plus a low-severity Monaco umbrella finding.

Added a targeted `overrides.dompurify` pin to 3.4.17, retaining the current Monaco version and API. After reinstall, `npm ls dompurify` confirms Monaco uses the patched override and `npm run audit:security` exits 0 with zero known vulnerabilities. Java playground browser acceptance is required alongside the build to cover the affected integration.

Added `@playwright/test` as a development dependency for repeatable desktop/mobile functional tests.

A same-worktree `npm ci --ignore-scripts` attempt hit Windows EPERM on an esbuild binary in use. A subsequent `npm install` restored dependencies and audit passed. To avoid killing unrelated developer processes, a separate clean workspace was then created under the approved OpenCode temporary directory. `npm ci --include=dev` and `npm run build` both passed there, including design lint, TypeScript and the frontend production build. Docker/Linux CI remains a separate check.
