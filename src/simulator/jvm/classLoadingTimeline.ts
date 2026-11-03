/*
 * JVM runtime timeline (Phase 2) — what happens between 'java Main' and 'main()'.
 *
 * Connects back to Phase 1: the JVM itself is just an OS process. Inside it we watch the loader
 * delegation chain, Metaspace, the generational heap and the main thread's stack come to life.
 */

import type { HeapObject, JvmStep, LoaderId, LoaderPart, LoadedClass } from './types';

const LOADERS: LoaderPart[] = [
  { id: 'bootstrap', label: 'Bootstrap loader', state: 'idle', note: 'Loads the core platform classes (rt.jar / modules)' },
  { id: 'platform', label: 'Platform loader', state: 'idle', note: 'Loads platform modules; delegates up first' },
  { id: 'application', label: 'Application loader', state: 'idle', note: 'Loads your classpath; delegates up first' },
];

function loader(id: LoaderId, state: LoaderPart['state'], note?: string): LoaderPart[] {
  return LOADERS.map((candidate) =>
    candidate.id === id ? { ...candidate, state, note: note ?? candidate.note } : { ...candidate },
  );
}

function klass(name: string, loaderId: LoaderId, stage: LoadedClass['stage'], note?: string): LoadedClass {
  return { name, loader: loaderId, stage, note };
}

function obj(id: string, label: string, generation: HeapObject['generation']): HeapObject {
  return { id, label, generation };
}

export const JVM_TIMELINE: JvmStep[] = [
  {
    id: 'spawn',
    phase: 'Process',
    title: 'java Main — just another OS process',
    narration:
      'From Phase 1 you know this moment: the OS reads the program image (here: the java launcher) from disk, maps it into a fresh user-space address space and creates a process. The JVM is not magic — it is that process.',
    loaders: LOADERS.map((candidate) => ({ ...candidate })),
    classes: [],
    heap: [],
    threads: [],
    console: ['OS: process created → java'],
  },
  {
    id: 'memory',
    phase: 'Runtime data areas',
    title: 'The JVM scaffolds its memory',
    narration:
      'Before any Java runs, the JVM carves its runtime data areas out of the process memory: the heap for objects (Eden → Survivor → Old Gen), Metaspace for class metadata (native memory, not the heap), and a private stack per thread for frames.',
    loaders: LOADERS.map((candidate) => ({ ...candidate })),
    classes: [],
    heap: [],
    threads: [],
    console: ['JVM: heap + Metaspace created'],
  },
  {
    id: 'bootstrap',
    phase: 'Class loading',
    title: 'The bootstrap loader wakes',
    narration:
      'Every Java program needs java.lang.Object, String and System before a single line of Main can run. The bootstrap loader — written in native code — loads these core classes into Metaspace.',
    loaders: loader('bootstrap', 'active', 'Loading the core classes'),
    classes: [
      klass('java.lang.Object', 'bootstrap', 'ready'),
      klass('java.lang.String', 'bootstrap', 'ready'),
      klass('java.lang.System', 'bootstrap', 'ready'),
    ],
    heap: [],
    threads: [],
    console: ['Bootstrap: java.lang.Object, String, System loaded'],
  },
  {
    id: 'delegation',
    phase: 'Class loading',
    title: 'Main is requested — delegation first',
    narration:
      'The application loader is asked for Main — but it never looks at its own classpath first. It delegates to the platform loader, which delegates to the bootstrap loader. Only when both say "not mine" does the application loader load Main itself. Delegation keeps core classes impossible to spoof.',
    loaders: loader('application', 'active', 'Delegating up, then loading from the classpath'),
    classes: [
      klass('java.lang.Object', 'bootstrap', 'ready'),
      klass('java.lang.String', 'bootstrap', 'ready'),
      klass('java.lang.System', 'bootstrap', 'ready'),
      klass('Main', 'application', 'loading', 'Found on the classpath — after delegation said no'),
    ],
    heap: [],
    threads: [],
    console: ['Application: delegate → platform → bootstrap', 'Application: loading Main from the classpath'],
  },
  {
    id: 'verify',
    phase: 'Linking',
    title: 'Linking 1/3 — verify',
    narration:
      "Before Main's bytecode runs, the verifier proves it is safe: every branch is sane, no illegal casts, no stack overflows or underflows. This is why Java rarely crashes the whole process on a bad cast — the bytecode never gets to run.",
    loaders: loader('application', 'active', 'Verifying Main'),
    classes: [
      klass('java.lang.Object', 'bootstrap', 'ready'),
      klass('java.lang.String', 'bootstrap', 'ready'),
      klass('java.lang.System', 'bootstrap', 'ready'),
      klass('Main', 'application', 'verify', 'Proving the bytecode is safe'),
    ],
    heap: [],
    threads: [],
    console: ['Verifier: Main passes'],
  },
  {
    id: 'prepare',
    phase: 'Linking',
    title: 'Linking 2/3 — prepare',
    narration:
      'Static fields get memory and default values — 0, false, null. Not your initialisers yet: "static int count = 42" is still 0 at this point. The initialiser runs only at the initialise stage.',
    loaders: loader('application', 'active', 'Preparing statics'),
    classes: [
      klass('java.lang.Object', 'bootstrap', 'ready'),
      klass('java.lang.String', 'bootstrap', 'ready'),
      klass('java.lang.System', 'bootstrap', 'ready'),
      klass('Main', 'application', 'prepare', 'statics = defaults (0 / false / null)'),
    ],
    heap: [],
    threads: [],
    console: ['Linker: statics prepared (defaults)'],
  },
  {
    id: 'resolve',
    phase: 'Linking',
    title: 'Linking 3/3 — resolve',
    narration:
      'The constant pool is full of symbolic references — names like "java/lang/System.out". Resolution turns them into real addresses in Metaspace, lazily as each one is first used.',
    loaders: loader('application', 'active', 'Resolving symbolic references'),
    classes: [
      klass('java.lang.Object', 'bootstrap', 'ready'),
      klass('java.lang.String', 'bootstrap', 'ready'),
      klass('java.lang.System', 'bootstrap', 'ready'),
      klass('Main', 'application', 'resolve', 'Names → real addresses'),
    ],
    heap: [],
    threads: [],
    console: ['Linker: constant pool resolved (lazily)'],
  },
  {
    id: 'initialise',
    phase: 'Initialisation',
    title: 'Initialise — <clinit> runs',
    narration:
      'Now — and only now — static initialisers execute: the compiler folded every "static" field assignment and "static { }" block into one synthetic method called <clinit>. The JVM guarantees it runs exactly once, under a lock, in the right order.',
    loaders: loader('application', 'done', 'Main fully loaded and initialised'),
    classes: [
      klass('java.lang.Object', 'bootstrap', 'ready'),
      klass('java.lang.String', 'bootstrap', 'ready'),
      klass('java.lang.System', 'bootstrap', 'ready'),
      klass('Main', 'application', 'initialise', '<clinit> running — statics get real values'),
    ],
    heap: [],
    threads: [],
    console: ['Main.<clinit>() running'],
  },
  {
    id: 'main-thread',
    phase: 'Execution',
    title: 'The main thread starts',
    narration:
      'The JVM spawns the main thread and pushes a stack frame for main(String[]): local variable slot 0 holds args. Java method calls are frames on a thread stack — exactly the picture from Phase 1, now with contents.',
    loaders: LOADERS.map((candidate) => ({ ...candidate, state: 'done' })),
    classes: [
      klass('java.lang.Object', 'bootstrap', 'ready'),
      klass('java.lang.String', 'bootstrap', 'ready'),
      klass('java.lang.System', 'bootstrap', 'ready'),
      klass('Main', 'application', 'ready'),
    ],
    heap: [],
    threads: [{ name: 'main', state: 'running', frames: [{ method: 'Main.main(String[])' }] }],
    console: ['JVM: main thread started'],
  },
  {
    id: 'first-objects',
    phase: 'Heap',
    title: 'Objects are born in Eden',
    narration:
      'Every "new" allocates in Eden — the youngest generation. Allocation is a pointer bump: Eden is designed so that most objects die young and are cheap to collect.',
    loaders: LOADERS.map((candidate) => ({ ...candidate, state: 'done' })),
    classes: [
      klass('java.lang.Object', 'bootstrap', 'ready'),
      klass('java.lang.String', 'bootstrap', 'ready'),
      klass('java.lang.System', 'bootstrap', 'ready'),
      klass('Main', 'application', 'ready'),
    ],
    heap: [obj('h1', 'order', 'eden'), obj('h2', 'cart', 'eden'), obj('h3', 'temp', 'eden')],
    threads: [{ name: 'main', state: 'running', frames: [{ method: 'Main.main(String[])' }] }],
    console: ['Heap: 3 objects allocated in Eden'],
  },
  {
    id: 'minor-gc',
    phase: 'Heap',
    title: 'Minor GC — survive or die',
    narration:
      'Eden fills, so a minor GC runs: live objects are copied into Survivor space and everything dead is reclaimed in bulk. Objects that survive several collections are eventually tenured into Old Gen. Two of our three objects die young — the common case the design bets on.',
    loaders: LOADERS.map((candidate) => ({ ...candidate, state: 'done' })),
    classes: [
      klass('java.lang.Object', 'bootstrap', 'ready'),
      klass('java.lang.String', 'bootstrap', 'ready'),
      klass('java.lang.System', 'bootstrap', 'ready'),
      klass('Main', 'application', 'ready'),
    ],
    heap: [obj('h1', 'order → survivor', 'survivor'), obj('h4', 'config → old', 'old')],
    threads: [{ name: 'main', state: 'running', frames: [{ method: 'Main.main(String[])' }] }],
    console: ['GC (minor): eden collected', 'GC: 1 object survived → Survivor', 'GC: 1 tenured → Old Gen'],
  },
  {
    id: 'lazy-load',
    phase: 'Class loading',
    title: 'More classes load on demand',
    narration:
      'The first time code touches a new class (say, ArrayList), the loaders repeat their delegation dance while the program is running. Loading is lazy — classes cost nothing until used.',
    loaders: loader('application', 'active', 'Loading ArrayList on first use'),
    classes: [
      klass('java.lang.Object', 'bootstrap', 'ready'),
      klass('java.lang.String', 'bootstrap', 'ready'),
      klass('java.lang.System', 'bootstrap', 'ready'),
      klass('Main', 'application', 'ready'),
      klass('java.util.ArrayList', 'bootstrap', 'ready', 'Loaded lazily on first use'),
    ],
    heap: [obj('h1', 'order → survivor', 'survivor'), obj('h4', 'config → old', 'old'), obj('h5', 'items', 'eden')],
    threads: [{ name: 'main', state: 'running', frames: [{ method: 'Main.main(String[])' }] }],
    console: ['Application: java.util.ArrayList loaded (lazy)'],
  },
  {
    id: 'main-prints',
    phase: 'Execution',
    title: 'main() runs — output hits the console',
    narration:
      'Frames push and pop as methods call each other; the operand stack in each frame carries intermediate values. Printing walks out through System.out to the OS — the same stdout the Phase 1 process owned.',
    loaders: LOADERS.map((candidate) => ({ ...candidate, state: 'done' })),
    classes: [
      klass('java.lang.Object', 'bootstrap', 'ready'),
      klass('java.lang.String', 'bootstrap', 'ready'),
      klass('java.lang.System', 'bootstrap', 'ready'),
      klass('Main', 'application', 'ready'),
      klass('java.util.ArrayList', 'bootstrap', 'ready'),
    ],
    heap: [obj('h1', 'order → survivor', 'survivor'), obj('h4', 'config → old', 'old'), obj('h5', 'items', 'eden')],
    threads: [{ name: 'main', state: 'running', frames: [{ method: 'Main.main(String[])' }] }],
    console: ['Main started', 'items = [order, cart]'],
  },
  {
    id: 'exit',
    phase: 'Process',
    title: 'main() returns — the JVM exits',
    narration:
      'When the last non-daemon thread finishes, the JVM tears itself down: the OS reclaims the whole process — heap, Metaspace, stacks, everything — exactly the lifecycle Phase 1 taught, from the inside.',
    loaders: LOADERS.map((candidate) => ({ ...candidate, state: 'done' })),
    classes: [
      klass('java.lang.Object', 'bootstrap', 'ready'),
      klass('java.lang.String', 'bootstrap', 'ready'),
      klass('java.lang.System', 'bootstrap', 'ready'),
      klass('Main', 'application', 'ready'),
      klass('java.util.ArrayList', 'bootstrap', 'ready'),
    ],
    heap: [],
    threads: [{ name: 'main', state: 'done', frames: [] }],
    console: ['Process exited (code 0)'],
  },
];
