# Phase 1 acceptance coverage

This phase covers authentication and authorization, not the later lesson editor or AI features.

## Required local checks

- Backend functional/security tests: password verification, opaque session persistence, expiry/revocation, login throttling, CSRF/origin protection, admin/guest direct API permissions, disabled legacy auth flows, configuration checks.
- Frontend design lint, TypeScript, production build and whitespace checks.
- Dependency vulnerability audit.
- Desktop and mobile browser flows: anonymous access, invalid credentials, login, refresh, verified admin Studio access, guest denial, logout, missing-CSRF rejection and network failure/retry.
- Regression interactions: lesson stepping/restart/language switching, existing routes and Java playground execution.
- Capture reviewed post-login screenshots only; do not capture passwords, cookies or provider keys.

## Separate deployment checks

Local HTTP tests cannot establish production Secure-cookie behavior, PostgreSQL connectivity, Docker image viability, Render plan/usage settings or deployment health. Those checks require actual deployment/access and must be explicitly reported if blocked.

## Known out-of-scope existing issues

The V1 browser speech implementation and its voice-off auto-advance behavior will be revised in the dedicated playback phase. Passing Phase 1 does not certify browser TTS voice quality or narration timing. Broader keyboard/glossary accessibility and visual choreography also need their planned follow-up coverage.
