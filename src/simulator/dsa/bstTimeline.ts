/*
 * Binary Search Tree timeline (Phase 3) — inserts that walk the invariant, then a search that
 * hits and one that misses. Node positions are precomputed grid coordinates (column, depth) so
 * the renderer never has to lay anything out at runtime.
 */

import type { DsaStep, TreeEdgeView, TreeNodeView } from './types';

type NodeDraft = Omit<TreeNodeView, 'state'> & { state?: TreeNodeView['state'] };

function tree(nodes: NodeDraft[], edges: Array<[string, string]>, pathEdges: string[] = []): {
  nodes: TreeNodeView[];
  edges: TreeEdgeView[];
} {
  return {
    nodes: nodes.map((node) => ({ ...node, state: node.state ?? 'idle' })),
    edges: edges.map(([from, to]) => ({
      from,
      to,
      state: pathEdges.includes(to) ? 'path' : 'idle',
    })),
  };
}

const N50: NodeDraft = { id: 'n50', value: 50, x: 3, y: 0, note: 'root' };
const N30: NodeDraft = { id: 'n30', value: 30, x: 1, y: 1 };
const N70: NodeDraft = { id: 'n70', value: 70, x: 5, y: 1 };
const N20: NodeDraft = { id: 'n20', value: 20, x: 0, y: 2 };
const N40: NodeDraft = { id: 'n40', value: 40, x: 2, y: 2 };
const N65: NodeDraft = { id: 'n65', value: 65, x: 4, y: 2 };

export const BST_TIMELINE: DsaStep[] = [
  {
    id: 'empty',
    phase: 'Insert',
    title: 'An empty tree and one rule',
    narration:
      'A binary search tree keeps one promise: every value left of a node is smaller, every value right is larger. That single rule is what makes lookups fast — each comparison throws away half of what remains.',
    stats: [],
    tree: tree([], []),
  },
  {
    id: 'insert-50',
    phase: 'Insert 50',
    title: '50 becomes the root',
    narration:
      'The tree is empty, so 50 lands at the root. In memory this is a heap object: a value, a left pointer and a right pointer, both null for now.',
    stats: [{ label: 'Comparisons', value: '0' }],
    tree: tree([N50], []),
  },
  {
    id: 'insert-30',
    phase: 'Insert 30',
    title: '30 — smaller, so left of 50',
    narration:
      'Compare 30 with 50: smaller, so the left pointer wins. 50 has no left child yet — 30 becomes it.',
    stats: [{ label: 'Comparisons', value: '1' }],
    tree: tree(
      [{ ...N50, state: 'compare', note: '30 < 50 → left' }, N30],
      [['n50', 'n30']],
      ['n30'],
    ),
  },
  {
    id: 'insert-70',
    phase: 'Insert 70',
    title: '70 — larger, so right of 50',
    narration: 'Compare 70 with 50: larger, right side. One comparison, one placement.',
    stats: [{ label: 'Comparisons', value: '1' }],
    tree: tree(
      [{ ...N50, state: 'compare', note: '70 > 50 → right' }, { ...N30, state: 'idle' }, N70],
      [
        ['n50', 'n30'],
        ['n50', 'n70'],
      ],
      ['n70'],
    ),
  },
  {
    id: 'insert-20',
    phase: 'Insert 20',
    title: '20 — two comparisons down the left',
    narration:
      '20 < 50 → go left. 20 < 30 → go left again. The path is the invariant in action: every step chooses a subtree and discards the other.',
    stats: [{ label: 'Comparisons', value: '2' }],
    tree: tree(
      [
        { ...N50, state: 'path' },
        { ...N30, state: 'compare', note: '20 < 30 → left' },
        { ...N70, state: 'idle' },
        N20,
      ],
      [
        ['n50', 'n30'],
        ['n50', 'n70'],
        ['n30', 'n20'],
      ],
      ['n20'],
    ),
  },
  {
    id: 'insert-40',
    phase: 'Insert 40',
    title: '40 — left, then right',
    narration: '40 < 50 → left. 40 > 30 → right. 40 becomes 30\u2019s right child. The tree stays sorted: an in-order walk would read 20, 30, 40, 50, 70.',
    stats: [{ label: 'Comparisons', value: '2' }],
    tree: tree(
      [
        { ...N50, state: 'path' },
        { ...N30, state: 'compare', note: '40 > 30 → right' },
        { ...N70, state: 'idle' },
        { ...N20, state: 'idle' },
        N40,
      ],
      [
        ['n50', 'n30'],
        ['n50', 'n70'],
        ['n30', 'n20'],
        ['n30', 'n40'],
      ],
      ['n40'],
    ),
  },
  {
    id: 'invariant',
    phase: 'Structure',
    title: 'The invariant, checked',
    narration:
      'Every node now satisfies the rule: left subtrees hold smaller values, right subtrees larger. Nothing was re-ordered — insertion *is* the sort. The cost of each insert was the depth of the landing spot, not the size of the tree.',
    stats: [{ label: 'Nodes', value: '5' }],
    tree: tree([N50, N30, N70, N20, N40], [
      ['n50', 'n30'],
      ['n50', 'n70'],
      ['n30', 'n20'],
      ['n30', 'n40'],
    ]),
  },
  {
    id: 'search-40-hit',
    phase: 'Search 40',
    title: 'Search 40 — found in three comparisons',
    narration:
      '40 < 50 → left. 40 > 30 → right. 40 == 40 → found. Three comparisons in a five-node tree; an unsorted array would scan up to five. Scale that gap up: a balanced tree of a million nodes finds anything in about twenty.',
    stats: [
      { label: 'Comparisons', value: '3' },
      { label: 'Result', value: 'found' },
    ],
    tree: tree(
      [
        { ...N50, state: 'path' },
        { ...N30, state: 'path' },
        { ...N70, state: 'idle' },
        { ...N20, state: 'idle' },
        { ...N40, state: 'found', note: 'found!' },
      ],
      [
        ['n50', 'n30'],
        ['n50', 'n70'],
        ['n30', 'n20'],
        ['n30', 'n40'],
      ],
      ['n30', 'n40'],
    ),
  },
  {
    id: 'search-65-miss',
    phase: 'Search 65',
    title: 'Search 65 — proven absent, not scanned',
    narration:
      '65 > 50 → right. 65 < 70 → left. 70 has no left child — and because of the invariant, 65 cannot be anywhere else. The search proves absence without touching most of the tree.',
    stats: [
      { label: 'Comparisons', value: '2' },
      { label: 'Result', value: 'not found' },
    ],
    tree: tree(
      [
        { ...N50, state: 'path' },
        { ...N30, state: 'idle' },
        { ...N70, state: 'compare', note: '65 < 70 → left (empty)' },
        { ...N20, state: 'idle' },
        { ...N40, state: 'idle' },
        N65,
      ],
      [
        ['n50', 'n30'],
        ['n50', 'n70'],
        ['n30', 'n20'],
        ['n30', 'n40'],
      ],
      ['n70'],
    ),
  },
  {
    id: 'balance',
    phase: 'Structure',
    title: 'The catch: shape depends on order',
    narration:
      'This tree happens to be balanced because the values arrived kindly. Insert the same five values already sorted (20, 30, 40, 50, 70) and every node lands on one path — a linked list in disguise. Self-balancing trees (AVL, red-black) exist to fight exactly that.',
    stats: [{ label: 'Nodes', value: '5' }],
    tree: tree([N50, N30, N70, N20, N40, N65], [
      ['n50', 'n30'],
      ['n50', 'n70'],
      ['n30', 'n20'],
      ['n30', 'n40'],
    ]),
  },
];
