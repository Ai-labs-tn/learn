/** Bytecode stepper — the Phase 2b learning screen (composition only, no styles). */
import { PageHeader, Stack } from '@agiler/ui';

import { BytecodeStepper } from '../scaffold';

export function BytecodeStepperScreen() {
  return (
    <Stack gap={6}>
      <PageHeader
        title="Bytecode stepper"
        description="One source line decomposed into its micro-steps. Watch the operand stack push and pop, the local slots fill, and a real frame appear when add() is invoked — the listing is exact javap -c output."
      />
      <BytecodeStepper />
    </Stack>
  );
}
