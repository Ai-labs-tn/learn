/*
 * DSA simulation types (Phase 3) — same engine contract as the other tracks:
 * immutable snapshots + a step pointer. Each snapshot renders one structure
 * with its memory-shaped detail (indices, pointers, buckets, addresses).
 */

export type NodeState = 'idle' | 'visiting' | 'compare' | 'placed' | 'found' | 'path' | 'new';

/** A BST node laid out on a grid (column x, depth y). */
export interface TreeNodeView {
  id: string;
  value: number;
  x: number;
  y: number;
  state: NodeState;
  note?: string;
}

export interface TreeEdgeView {
  from: string;
  to: string;
  state: 'idle' | 'path' | 'new';
}

export interface TreeView {
  nodes: TreeNodeView[];
  edges: TreeEdgeView[];
}

export type CellState = 'idle' | 'compare' | 'swap' | 'sorted';

export interface ArrayCellView {
  index: number;
  value: number;
  state: CellState;
}

export interface ArrayView {
  cells: ArrayCellView[];
  /** Named pointers (i, j) drawn above the cells. */
  pointers: Array<{ name: string; index: number }>;
}

export interface BucketItemView {
  key: string;
  value: string;
  state: 'idle' | 'new' | 'probe' | 'found';
}

export interface BucketView {
  index: number;
  items: BucketItemView[];
}

export interface HashView {
  slots: BucketView[];
  /** The key being placed/looked up and its bucket, shown as the hash line. */
  hashOf?: { key: string; bucket: number };
}

export interface DsaStep {
  id: string;
  phase: string;
  title: string;
  narration: string;
  /** Live counters (comparisons, swaps, probes). */
  stats: Array<{ label: string; value: string }>;
  tree?: TreeView;
  array?: ArrayView;
  hash?: HashView;
}

export type TopicId = 'bst' | 'sort' | 'hash';
