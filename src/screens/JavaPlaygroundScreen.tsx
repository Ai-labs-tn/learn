/** Java playground — the Phase 2b learning screen (composition only, no styles). */
import { PageHeader, Stack } from '@agiler/ui';

import { JavaPlayground } from '../scaffold/playground';

export function JavaPlaygroundScreen() {
  return (
    <Stack gap={6}>
      <PageHeader
        title="Write your own"
        description="Type Java, press Run, and watch your own program compile to bytecode and execute one micro-step at a time — the same engine, now fed by your code."
      />
      <JavaPlayground />
    </Stack>
  );
}
