# Phase 3, slice 1: Inside the machine

Approved eight-scene storyboard implemented as a new Computer Basics chapter at `#/skills/computer-basics/inside-machine`. Existing Boot & OS remains the default and is unchanged.

- Connected motherboard/case illustration, CPU cutaway, DIMMs, firmware IC, PSU, controller, SATA cables, SSD and HDD.
- Manual power preparation/reset, instruction fetch/execute, RAM write/read, POST failure/retry, power-loss prediction, and nearby/scattered storage reads.
- Every scene reconstructs its state on re-entry; failure blocks guided Next until passing checks; scene tabs allow exploration out of order.
- Contextual zoom/inspection, English/Tamil captions, optional browser speech, motion pause, hidden-tab pause and reduced-motion CSS.
- Existing inline admin caption workflow generalized by baseline document; isolated `computer-hardware-pilot` lesson created only on explicit first Save. Existing boot caption editor is regression tested.
- Physical network connector is distinguished from logical TCP ports. Startup and transfer animations are conceptual; no benchmark claims. Storage inspection is explicitly separate from boot.

Validation: production build (design lint, theme lint, TypeScript) passes; full browser suite 122 passed on isolated local SQLite server, including original authoring/playback/auth tests. New pilot document accepted by the backend LessonDocument schema. Screenshots under frontend/screenshots; browser-results.xml records the full run. No new backend runtime code or migration; no production content writes or actual AI calls used in testing.

This is an illustrative SVG prototype for owner review, not a literal electrical simulator or photorealistic hardware render. Interactions and captions implement the first eight approved scenes only. UI action labels remain English when Tamil captions are selected. Chrome/OS launch, networking and JVM chapters remain future slices. CPU register/memory locations and storage positions are teaching abstractions; hardware timing and logical-to-physical block mapping are not simulated. The two storage devices shown use SATA; NVMe is explained, not animated. Reference source for review: UEFI Specification and Intel architecture manuals as linked in the inline authoring panel.
