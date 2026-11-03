Here is a comprehensive Product Requirement Document (PRD) designed to kickstart your interactive visualizer website. It outlines the problem statement and details the Simulation Approach (AST Parsing & Frontend Animation), ensuring a secure, highly scalable, and visually rich user experience.

Product Requirement Document (PRD)


Project Name: JVM-Lens (Interactive JVM Runtime & Boot Simulator)


1. Problem Statement

Learning Java internals—such as Class Loader delegation, Runtime Data Areas (Heap, Stack, Metaspace), and Bytecode execution—is highly abstract. Traditional tools like command-line profilers (jvisualvm, jcmd) are built for production debugging, not education. Existing consumer web visualizers (e.g., Python Tutor) only show the basic method stack and object heap.
There is currently no accessible, web-based simulator that visualizes the holistic life cycle of a Java application, explicitly capturing:
• The phase-by-phase JVM bootstrap and Class Loader subsystem sequence.
• The explicit structural division of the JVM Memory Model (Metaspace, Stack, and generational Heap).
• The exact translation of source code statements into bytecode execution frames.

2. System Architecture (The Simulation Approach)

To avoid the security, cost, and latency overhead of running a real multi-tenant backend Java compiler, this platform utilizes a 100% Frontend-Driven Simulation Engine.
[User Code Input] 
       │
       ▼
[AST Parser (java-ast / antlr4)] ──► [Simulation State Machine]
                                              │
                                              ▼
                                 [State Snapshots Array]
                                              │
       ┌──────────────────────────────────────┼──────────────────────────────────┐
       ▼                                      ▼                                  ▼
┌──────────────────────────────┐    ┌──────────────────────────────┐    ┌──────────────────────────────┐
│  Phase 1: Class Loader UI    │    │ Phase 2: Runtime Memory UI   │    │    Phase 3: Execution UI     │
│  - Bootstrap / Ext / App     │    │ - Metaspace / Stack Frames   │    │ - Bytecode Visualizer        │
│  - Loading/Linking/Init      │    │ - Generational Heap Tracking │    │ - Line-by-Line Execution     │
└──────────────────────────────┘    └──────────────────────────────┘    └──────────────────────────────┘
1. Code Ingestion: The user writes or selects a standard Java code snippet in a web-based code editor.
2. AST Generation: A lightweight JavaScript/TypeScript open-source Java parser splits the text into an Abstract Syntax Tree (AST).
3. State Machine Compilation: The custom simulation engine walks the AST to pre-calculate an array of sequential "State Snapshots" representing every micro-step of execution (from booting up to main() termination).
4. Reactive Visualization: The frontend UI tracks a single pointer currentStepIndex. When the user clicks "Next", the UI transitionally animates to match the data structure inside that step's snapshot.

3. Core Feature Requirements


Feature 1: The JVM Subsystem Tracker (Boot & Class Loading)

• User Experience: Before the user's code runs, the web app forces a "Boot Sequence" mode. A graphical hierarchy diagram lights up step-by-step.
• Simulated Stages:
	• Phase 1: Loading: Animate the delegation model. Request goes from Application ClassLoader \(\rightarrow \) Platform ClassLoader \(\rightarrow \) Bootstrap ClassLoader. Show the Bootstrap loader loading core classes (like java.lang.Object), then the App loader fetching the user's custom class.
	• Phase 2: Linking: Show three visual sub-steps: Verification (bytecode structural safety check), Preparation (allocating memory for static fields and initializing them to default values), and Resolution (symbolic references replaced with direct references).
	• Phase 3: Initialization: Execute the static initializers (static {} blocks) and assign actual values to static variables.

Feature 2: Generational Runtime Memory Visualizer

A split-pane canvas mapping out the core JVM memory areas, changing dynamically as the simulation advances:

JVM Memory Section	Visual Element Type	Simulated Behavior & Attributes to Display
Metaspace (Method Area)	Static Grid	Holds loaded class structural metadata, constant pool, methods bytecode, and static variables. Populated entirely during Feature 1.
JVM Stack	Vertical Stack Diagram	Grows downward. Each method call pushes a new frame containing: 1) Local Variable Table (primitives and object pointers) and 2) Operand Stack (for executing expressions).
Heap (Young Gen - Eden/Survivor)	Dynamic Box Layout	New object instantiations (new MyClass()) instantly animate a block dropping into the Eden Space.
Heap (Old Gen)	Side Compartment	When the simulation triggers a mocked "Garbage Collection" step, surviving blocks slide into Survivor spaces and eventually migrate to the Old Gen area.


Feature 3: Pseudo-Bytecode & Code Stepper

• Dual Editor Sync: Next to the source code editor, show a generated, simplified text view of Java Bytecode instructions (e.g., aload_0, invokevirtual, ireturn).
• Instruction Mapping: Stepping through a single line of Java source code decomposes into multiple micro-steps highlighting the exact corresponding bytecode instructions and showing data moving in and out of the active frame's Operand Stack.

4. Technical Stack Recommendation

• Frontend Framework: React or Vue.js with TypeScript for strict type checking on the Simulation State schemas.
• Code Editor Component: Monaco Editor (the core engine behind VS Code) for native Java syntax highlighting and error checking.
• Java Parser: java-ast (npm package) or an ANTLR4-generated JavaScript target parser for Java grammar.
• Animation & Rendering Engine:
	• React Flow / X6: Ideal for building the structured nodes, linking lines, and hierarchical layout of the Class Loaders and Memory Compartments.
	• Framer Motion: For clean, smooth UI transitions when variable boxes pop into existence or arrays resize.

5. Non-Functional Requirements & Security

• Client-Side Isolated Execution: Because the code parsing and state compilation happen entirely inside the user's web browser, malicious infinite loops (while(true)) or system commands (Runtime.getRuntime().exec()) will safely fail or hang only the client's local tab without endangering any servers.
• Deterministic Step Limits: To prevent browser crashes from large input codes, the simulation generator must stop compiling and throw a friendly warning if the state snapshot array exceeds 500 steps.
Would you like me to map out the JSON Schema structure for a single "State Snapshot" to show you exactly how the frontend code will pass memory states to the UI rendering canvas?
