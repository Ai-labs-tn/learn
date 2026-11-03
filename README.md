# Learn — JVM-Lens (Computer & JVM Simulator)

An educational platform that teaches by **simulating the machine in 2D**: how a program really
works inside a computer, from the moment power is applied to a running Java application — and,
step by step, how data structures behave in memory.

> Placed as an AGILER order: **`epic-54567c59`** (product type `education`, audience `education`).
> The requirement lives in [`docs/prd/`](./docs/prd/learn_with_saravana.md) (with the hand-drawn
> sketches the design follows).

## What it teaches

| Phase | Track | What the learner watches |
| --- | --- | --- |
| 1 | **How a computer works** | CPU cores & *true parallelism*, volatile RAM vs non-volatile HDD/SSD, and the boot chain: CPU → BIOS/UEFI → POST → bootloader (GRUB / Windows boot manager) → kernel loaded into RAM → kernel takes over → hardware activates → `init` (Linux) / `smss.exe` (Windows) → GUI → login screen — then launching any application as an OS process |
| 2 | **How a Java program executes** | Class-loader delegation (load → link: verify/prepare/resolve → initialise), the runtime memory model (Metaspace, stack frames with local variables + the operand stack, generational heap Eden/Survivor → Old Gen, garbage collection), and a **bytecode stepper** (one source line decomposed into its micro-steps) |
| 3 | **DSA internals** | Data structures shown in memory, step by step |

## The engine is the core

Everything is driven by one idea — **100% client-side simulation**:

```
code → AST parser (java-ast / ANTLR4) → simulation state machine → state snapshots[]
                                                                    │
                                                    UI = a single currentStepIndex pointer
```

The user edits Java in Monaco, the engine walks the AST and pre-computes every micro-step as a
state snapshot, and the UI animates to whichever snapshot the step pointer points at. No server
executes anything (malicious code can only hang the learner's own tab), and the generator stops
with a friendly warning past 500 snapshots.

## Status

- [x] PRD + sketches captured (`docs/prd/`)
- [x] AGILER order placed (`epic-54567c59`) — 12 features, ₹9,32,000
- [x] Delivery template planned (8 features · 24 stories)
- [ ] Phase 1 — boot & OS simulator
- [ ] Phase 2 — JVM runtime visualizer + bytecode stepper
- [ ] Phase 3 — DSA visualizer

## Stack

React + TypeScript (Vite) · FastAPI + Postgres · `@agiler/ui` design system · Monaco ·
java-ast / ANTLR4 · React Flow · Framer Motion.
