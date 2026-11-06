import pilot from './pilot.json' with { type: 'json' };
import { readDocument } from '../lessons/types';
export const PILOT = readDocument(pilot);
export type Part = 'overview' | 'cpu' | 'ram' | 'firmware' | 'storage';
export const SCENES: ReadonlyArray<{ title: string; focus: Part; question: string }> = [
  { title: 'Before the button', focus: 'overview', question: 'Where are your files while the machine is off?' },
  { title: 'The button requests startup', focus: 'overview', question: 'Is power/control activity the same as program data?' },
  { title: 'Meet the processor', focus: 'cpu', question: 'Does the processor permanently store your applications?' },
  { title: 'Firmware starts the work', focus: 'firmware', question: 'Where does the first instruction come from?' },
  { title: 'Meet RAM', focus: 'ram', question: 'How is a RAM location different from a CPU register?' },
  { title: 'Startup checks', focus: 'ram', question: 'What happens if an important memory check fails?' },
  { title: 'Why RAM and storage?', focus: 'overview', question: 'Which information remains after power is removed?' },
  { title: 'SSD versus HDD', focus: 'storage', question: 'What changes when reads are scattered rather than nearby?' },
];
export const INSPECTION: Record<Part, string> = {
  overview: 'One connected machine. Power and motherboard wiring support the parts; instructions and data use different control and interconnect paths. This is an illustrative PC, not a wiring schematic.',
  cpu: 'CPU = processor. A core executes instructions. Registers are small pieces of state inside a core; caches help supply instructions and data. This cutaway is simplified, not a literal chip layout.',
  ram: 'RAM modules provide volatile working memory. The processor reaches them through its memory controller and the memory interconnect. Locations drawn here represent an illustrative working view, not physical transistor layouts.',
  firmware: 'Firmware is software held in non-volatile storage on the motherboard. The processor executes that software; the chip itself does not act as a second CPU. Access paths depend on the platform.',
  storage: 'Both SSD and HDD are persistent storage. This example uses SATA devices and a motherboard storage controller. NVMe SSDs instead use PCIe. Storage access is not a direct magical transfer into CPU registers.',
};
export const READS = { nearby: [2, 3, 4, 5], scattered: [2, 13, 5, 10] } as const;
export type ReadPattern = keyof typeof READS;
