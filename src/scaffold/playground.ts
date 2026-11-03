/*
 * The playground lives in its own scaffold module so Monaco (its editor core is megabytes) stays
 * out of the eager import graph: App lazy-loads the playground *screen*, which imports this
 * module — the three snapshot tracks keep a light first paint. The design-lint allow-list is
 * prefix-based, so `../scaffold/playground` is a legal screen import.
 */
export { JavaPlayground } from '../simulator/jvm/JavaPlayground';
