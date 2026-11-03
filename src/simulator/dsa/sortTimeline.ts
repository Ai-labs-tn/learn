/*
 * Bubble sort timeline (Phase 3) — the array as memory cells, the pointers above them, and the
 * sorted tail growing one bubble at a time. O(n^2) shown honestly, by counting.
 */

import type { ArrayCellView, DsaStep } from './types';

type Cell = [value: number, state?: ArrayCellView['state']];

function cells(spec: Cell[], pointers: Array<{ name: string; index: number }>): {
  cells: ArrayCellView[];
  pointers: Array<{ name: string; index: number }>;
} {
  return {
    cells: spec.map(([value, state], index) => ({ index, value, state: state ?? 'idle' })),
    pointers,
  };
}

const BASE = [5, 1, 4, 2, 8];

export const SORT_TIMELINE: DsaStep[] = [
  {
    id: 'start',
    phase: 'Setup',
    title: 'Five ints in one array',
    narration:
      'An array is one contiguous block of memory: index i lives at address base + i * 4 bytes for ints. That is why reading any cell is O(1) — the address is arithmetic, not a walk. We will sort [5, 1, 4, 2, 8] by repeatedly bubbling the largest value to the end.',
    stats: [
      { label: 'Comparisons', value: '0' },
      { label: 'Swaps', value: '0' },
    ],
    array: cells(
      [
        [5],
        [1],
        [4],
        [2],
        [8],
      ],
      [],
    ),
  },
  {
    id: 'p1-c0',
    phase: 'Pass 1',
    title: 'Compare 5 and 1 — out of order, swap',
    narration:
      'j compares a[j] with a[j+1]. 5 > 1 so they swap: the larger of the pair is now on the right and keeps bubbling.',
    stats: [
      { label: 'Comparisons', value: '1' },
      { label: 'Swaps', value: '1' },
    ],
    array: cells(
      [
        [5, 'swap'],
        [1, 'swap'],
        [4],
        [2],
        [8],
      ],
      [
        { name: 'j', index: 0 },
        { name: 'i', index: 4 },
      ],
    ),
  },
  {
    id: 'p1-c1',
    phase: 'Pass 1',
    title: 'Compare 5 and 4 — swap again',
    narration: '5 is still the larger of its pair, so it keeps moving right.',
    stats: [
      { label: 'Comparisons', value: '2' },
      { label: 'Swaps', value: '2' },
    ],
    array: cells(
      [
        [1],
        [5, 'swap'],
        [4, 'swap'],
        [2],
        [8],
      ],
      [
        { name: 'j', index: 1 },
        { name: 'i', index: 4 },
      ],
    ),
  },
  {
    id: 'p1-c2',
    phase: 'Pass 1',
    title: 'Compare 5 and 2 — swap',
    narration: 'The large value bubbles right one cell per comparison — that is the whole algorithm.',
    stats: [
      { label: 'Comparisons', value: '3' },
      { label: 'Swaps', value: '3' },
    ],
    array: cells(
      [
        [1],
        [4],
        [5, 'swap'],
        [2, 'swap'],
        [8],
      ],
      [
        { name: 'j', index: 2 },
        { name: 'i', index: 4 },
      ],
    ),
  },
  {
    id: 'p1-c3',
    phase: 'Pass 1',
    title: 'Compare 5 and 8 — in order, no swap',
    narration:
      '8 > 5, so the pair stays. This also ends pass 1: the largest value (8) is guaranteed to sit at the end now — that position is sorted and never touched again.',
    stats: [
      { label: 'Comparisons', value: '4' },
      { label: 'Swaps', value: '3' },
    ],
    array: cells(
      [
        [1],
        [4],
        [2],
        [5],
        [8, 'sorted'],
      ],
      [
        { name: 'j', index: 3 },
        { name: 'i', index: 4 },
      ],
    ),
  },
  {
    id: 'p2-c0',
    phase: 'Pass 2',
    title: 'Pass 2: 1 and 4 stay, 4 and 2 swap',
    narration:
      'The second pass runs over a shrinking prefix — the sorted tail is off-limits. 4 > 2, so 4 bubbles one step right.',
    stats: [
      { label: 'Comparisons', value: '6' },
      { label: 'Swaps', value: '4' },
    ],
    array: cells(
      [
        [1],
        [4, 'swap'],
        [2, 'swap'],
        [5, 'sorted'],
        [8, 'sorted'],
      ],
      [
        { name: 'j', index: 1 },
        { name: 'i', index: 3 },
      ],
    ),
  },
  {
    id: 'p2-end',
    phase: 'Pass 2',
    title: 'Pass 2 ends: 5 joins the sorted tail',
    narration:
      'No value in the prefix is larger than 5, so after comparing it with 2 and finding nothing to move past it, 5 is fixed in place.',
    stats: [
      { label: 'Comparisons', value: '7' },
      { label: 'Swaps', value: '4' },
    ],
    array: cells(
      [
        [1],
        [2],
        [4],
        [5, 'sorted'],
        [8, 'sorted'],
      ],
      [{ name: 'i', index: 3 }],
    ),
  },
  {
    id: 'p3-end',
    phase: 'Pass 3',
    title: 'Pass 3: no swaps — the array is sorted',
    narration:
      '1 and 2 compare, nothing moves; 2 and 4 compare, nothing moves. A full pass with zero swaps proves the array is sorted — an early exit real implementations use. Total: 12 comparisons for 5 items; in the worst case bubble sort makes n(n-1)/2 of them. That is what O(n\u00B2) means in memory terms.',
    stats: [
      { label: 'Comparisons', value: '10' },
      { label: 'Swaps', value: '4' },
    ],
    array: cells(
      [
        [1, 'sorted'],
        [2, 'sorted'],
        [4, 'sorted'],
        [5, 'sorted'],
        [8, 'sorted'],
      ],
      [],
    ),
  },
];
