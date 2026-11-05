# Phase 3 hosted release

Released implementation: 4d131034ec682f9ebf3883fd655dcece42dd41ce.
CI https://github.com/Ai-labs-tn/learn/actions/runs/41971618441 passed: 191 backend tests with disposable PostgreSQL (1 skipped), 56 desktop/mobile browser tests, build/lint/types/audit and Docker build.

Hosted admin browser smoke passed on the existing UI: real bilingual editor loaded, private draft preview opened, history API returned 200, and the published boot-pilot document/revision was identical before and after verification. Mobile screenshot: hosted-studio-mobile.png. No hosted draft changes or test publications were made; write cycles were exercised on isolated local/CI databases. Logged out afterward.

Admin Studio editing/publishing/history is live. AI assistance and coordinated playback are separate subsequent phases.
