/** DSA visualizer — the Phase 3 learning screen (composition only, no styles). */
import { PageHeader, Stack } from '@agiler/ui';

import { DsaVisualizer } from '../scaffold';

export function DsaScreen() {
  return (
    <Stack gap={6}>
      <PageHeader
        title="Data structures, in memory"
        description="A binary search tree that walks its invariant, bubble sort with its pointers and counters, and a hash map that collides, chains and finds. Every step is the structure's real state."
      />
      <DsaVisualizer />
    </Stack>
  );
}
