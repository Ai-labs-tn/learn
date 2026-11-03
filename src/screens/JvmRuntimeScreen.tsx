/** JVM runtime simulator — the Phase 2a learning screen (composition only, no styles). */
import { PageHeader, Stack } from '@agiler/ui';

import { JvmRuntime } from '../scaffold';

export function JvmRuntimeScreen() {
  return (
    <Stack gap={6}>
      <PageHeader
        title="Inside the JVM"
        description="The JVM itself is just an OS process (Phase 1). Watch it scaffold its memory, load Main through the delegation chain, link and initialise it, then allocate into Eden, survive a minor GC and run main()."
      />
      <JvmRuntime />
    </Stack>
  );
}
