/** Skill-first learning map. Only chapters with an existing implementation are launchable. */
export type DemoId = 'boot-os' | 'jvm-runtime' | 'bytecode-stepper' | 'write-your-own' | 'dsa';
export type SkillId = 'computer-basics' | 'core-java' | 'spring-jpa' | 'gcp' | 'ai-ml' | 'sql-geospatial' | 'python-fastapi' | 'angular' | 'react';

export type Chapter = { id: DemoId; title: string; description: string };
export type Skill = {
  id: SkillId;
  title: string;
  introduction: string;
  chapters: readonly Chapter[];
  plannedTopics: readonly string[];
};

export const SKILLS: readonly Skill[] = [
  {
    id: 'computer-basics', title: 'Computer Basics',
    introduction: 'Start with the machine beneath every application: how power becomes a running program.',
    chapters: [
      { id: 'boot-os', title: 'Boot & OS', description: 'Step through power, firmware, POST, the bootloader, kernel and a running process.' },
    ],
    plannedTopics: ['Memory and storage', 'Processes, threads and scheduling', 'Networking fundamentals'],
  },
  {
    id: 'core-java', title: 'Core Java Internals',
    introduction: 'Follow a Java program from source to bytecode and execution, then explore the data structures behind it.',
    chapters: [
      { id: 'jvm-runtime', title: 'JVM runtime', description: 'Explore class loading, runtime memory and execution inside the JVM.' },
      { id: 'bytecode-stepper', title: 'Bytecode stepper', description: 'Watch instructions change the operand stack and local variables.' },
      { id: 'write-your-own', title: 'Java playground', description: 'Edit and run the supported Java subset in our educational compiler and interpreter—not a full JDK.' },
      { id: 'dsa', title: 'Data structures & algorithms', description: 'Explore trees, sorting and hash maps one step at a time.' },
    ],
    plannedTopics: ['Garbage collection', 'Collections internals', 'Concurrency and the Java memory model'],
  },
  {
    id: 'spring-jpa', title: 'Advanced Java — Spring Boot & JPA',
    introduction: 'Connect application architecture to the request, dependency and persistence lifecycles behind a service.',
    chapters: [], plannedTopics: ['Dependency injection and bean lifecycle', 'HTTP request flow', 'Transactions and persistence context', 'Entity relationships and query execution'],
  },
  {
    id: 'gcp', title: 'GCP',
    introduction: 'Understand how cloud identity, services and deployment decisions fit together.',
    chapters: [], plannedTopics: ['IAM and service accounts', 'Cloud Run request and deployment flow', 'Networking and storage', 'Pub/Sub messaging'],
  },
  {
    id: 'ai-ml', title: 'AI & ML',
    introduction: 'Build intuition for models and data, then follow the path from a question to a grounded AI response.',
    chapters: [], plannedTopics: ['Machine learning fundamentals', 'Embeddings and vector search', 'Retrieval-augmented generation (RAG)', 'LLM requests and evaluation'],
  },
  {
    id: 'sql-geospatial', title: 'SQL / Geospatial',
    introduction: 'See how relational queries and spatial operations turn stored data into useful answers.',
    chapters: [], plannedTopics: ['Joins and aggregation', 'Indexes and query plans', 'Spatial types and coordinate systems', 'PostGIS spatial queries'],
  },
  {
    id: 'python-fastapi', title: 'Python & FastAPI',
    introduction: 'Trace a Python program and follow a validated HTTP request through an API.',
    chapters: [], plannedTopics: ['Python execution and typing', 'Async and await', 'Request validation', 'FastAPI request lifecycle'],
  },
  {
    id: 'angular', title: 'Angular',
    introduction: 'Explore how components, dependencies and reactive data work together in an Angular application.',
    chapters: [], plannedTopics: ['Components and templates', 'Dependency injection', 'RxJS streams', 'Change detection and API integration'],
  },
  {
    id: 'react', title: 'React',
    introduction: 'Understand how state becomes a UI and how effects connect components to external systems.',
    chapters: [], plannedTopics: ['Components and rendering', 'State and hooks', 'Effects and cleanup', 'API integration'],
  },
];

export const skillPath = (id: SkillId) => `/skills/${id}`;
export const chapterPath = (skill: SkillId, chapter: DemoId) => `${skillPath(skill)}/${chapter}`;
export const DEFAULT_LEARNING_PATH = skillPath('computer-basics');

export type LearningRoute =
  | { kind: 'skill'; path: string; skill: Skill; chapter?: Chapter }
  | { kind: 'lessons'; path: string }
  | { kind: 'studio'; path: string };

/** Keep old bookmarks working, without fuzzy/sanitised matches that could open the wrong chapter. */
export function resolveLearningRoute(hash: string): LearningRoute {
  const path = (hash.replace(/^#/, '').split('?')[0] || DEFAULT_LEARNING_PATH).replace(/\/$/, '');
  if (path === '/studio' || path.startsWith('/studio/')) return { kind: 'studio', path: '/studio' };
  if (path === '/lessons') return { kind: 'lessons', path };
  for (const skill of SKILLS) {
    if (path === skillPath(skill.id)) return { kind: 'skill', path, skill, chapter: skill.chapters[0] };
    for (const chapter of skill.chapters) {
      if (path === chapterPath(skill.id, chapter.id) || path === `/${chapter.id}`) {
        return { kind: 'skill', path: chapterPath(skill.id, chapter.id), skill, chapter };
      }
    }
  }
  return { kind: 'skill', path: DEFAULT_LEARNING_PATH, skill: SKILLS[0], chapter: SKILLS[0].chapters[0] };
}
