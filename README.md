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
- [x] AGILER scaffold generated (Vite + React + `@agiler/ui` v0.5.1 + backend + db schema)
- [x] **Phase 1 — boot & OS simulator** (`src/simulator/`): deterministic snapshot engine
  (`types.ts` + `useSimulator.ts`) and the 16-step boot timeline (`boot/bootTimeline.ts`) rendered
  as a 2D machine (CPU cores, kernel/user RAM regions, HDD platter / SSD, firmware chip) with
  narration, boot log and process chips — [`src/screens/BootSimulatorScreen.tsx`](src/screens/BootSimulatorScreen.tsx)
- [x] **Phase 2 — JVM runtime + bytecode stepper** (`src/simulator/jvm/`): a 14-step runtime
  timeline (`classLoadingTimeline.ts`) — JVM as an OS process → runtime data areas → loader
  delegation → link (verify / prepare / resolve) → `<clinit>` → main thread → Eden allocation →
  minor GC → lazy loading → exit — rendered as a live memory model (loaders, Metaspace chips,
  generational heap lanes, thread frame stacks) (`JvmRuntime.tsx`); plus a **bytecode stepper**
  (`bytecodeTimeline.ts` + `BytecodeStepper.tsx`) that decomposes one source line into 14
  micro-steps against an exact `javap -c` listing: operand stack push/pop, local slots,
  `invokestatic` pushing a real frame and `ireturn` handing the value back. *Next in Phase 2:
  the Monaco editor + java-ast pipeline so learners type their own program.*
- [x] **Phase 2b — write your own** (`src/simulator/jvm/java/`): the PRD's pipeline live —
  Monaco editor → **Java-subset parser** (`parser.ts`) → **bytecode compiler** (`compiler.ts`,
  javap-shaped: iconst/iload/istore/iinc/if_icmp*/goto/invokestatic/getstatic+invokevirtual/
  invokedynamic concat) → **mini-JVM runner** (`engine.ts`) emitting one snapshot per instruction
  with the **500-snapshot cap and friendly warning**. The playground screen (`JavaPlayground.tsx`,
  lazy-loaded so Monaco stays out of the first paint) shares the curated stepper's visual.
  Parse errors report the line; runtime errors (e.g. division by zero) stop the run politely.
  Swapping in a full java-ast/ANTLR4 front-end later only replaces `parser.ts` + `compiler.ts`.
- [x] **Phase 3 — DSA visualizer** (`src/simulator/dsa/`): three structure simulators on the
  shared engine with a topic switcher — **Binary search tree** (`bstTimeline.ts`: inserts walking
  the invariant, a search that hits in three comparisons, a miss proven absent, and the
  balanced-vs-sorted-order honesty step), **Bubble sort** (`sortTimeline.ts`: cells as contiguous
  memory with `i`/`j` pointer chips, compare/swap/sorted states and live counters), and a
  **Hash map** (`hashTimeline.ts`: hash-line arithmetic, a real collision with separate chaining,
  a chained `get`, an empty-bucket miss and the O(n) asterisk) — all rendered as memory:
  SVG-linked node boxes, index labels, buckets.

All three phases of the order (`epic-54567c59`) are now live in the app.

## What comes next

- Lesson-tracks shell + progress tracking (the remaining order features)
- More structures on the same engine: linked list vs array, queue, merge sort
- The full java-ast/ANTLR4 front-end swap behind `simulate.ts`

## Run it

```bash
npm install
npm run dev      # all five learning tracks on :5173
npm run build    # design-lint + tsc + vite build
```

## Stack

React + TypeScript (Vite) · FastAPI + Postgres · `@agiler/ui` design system · Monaco ·
java-ast / ANTLR4 · React Flow · Framer Motion.
