/** Boot & OS simulator — the Phase 1 learning screen (composition only, no styles). */
import { PageHeader, Stack } from '@agiler/ui';

import { BootSimulator } from '../scaffold';

export function BootSimulatorScreen() {
  return (
    <Stack gap={6}>
      <PageHeader
        title="How a computer boots"
        description="Power on → firmware → POST → bootloader → kernel → user space → GUI → login → your application as an OS process. Step through the machine and watch every part light up."
      />
      <BootSimulator />
    </Stack>
  );
}
