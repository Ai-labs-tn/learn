/*
 * Boot & OS timeline — the first simulation track, on the lecturer's whiteboard.
 *
 * Each entry is a full, immutable machine snapshot PLUS the presenter's beat: a spoken caption,
 * which part is under the pointer, what gets sketched onto the board, and which connector flows.
 * `Next` moves the pointer; the renderer performs the beat.
 */

import type { BootStep, MachinePart, OsProcess, PartId, PartState, RamRegion } from '../types';

const PART_LABELS: Record<PartId, string> = {
  cpu: 'CPU',
  ram: 'RAM',
  hdd: 'HDD',
  ssd: 'SSD',
  firmware: 'BIOS / UEFI',
};

/** Build the full parts array for a step (`off` unless stated). */
function parts(
  states: Partial<Record<PartId, PartState>>,
  notes?: Partial<Record<PartId, string>>,
): MachinePart[] {
  return (Object.keys(PART_LABELS) as PartId[]).map((id) => ({
    id,
    label: PART_LABELS[id],
    state: states[id] ?? 'off',
    note: notes?.[id],
  }));
}

/** Build the two RAM regions (kernel space + user space) with a fill percentage. */
function ram(kernelFill: number, userFill: number, kernelNote?: string, userNote?: string): RamRegion[] {
  return [
    { id: 'kernel', label: 'Kernel space', fill: kernelFill, note: kernelNote },
    { id: 'user', label: 'User space', fill: userFill, note: userNote },
  ];
}

const APP_PROCESS: OsProcess = {
  name: 'my-app (OS process)',
  note: 'The loader mapped the program image from disk into a fresh address space; a CPU core runs its main thread.',
};

export const BOOT_TIMELINE: BootStep[] = [
  {
    id: 'power',
    phase: 'Power',
    title: 'Power on',
    caption:
      'Watch the board — the moment power arrives, everything wakes up empty. RAM remembers nothing; the disks and this small firmware chip are the only things that know anything.',
    focus: {
      part: 'board',
      action: 'draw',
      reveals: ['board', 'psu'],
      flow: 'psu-board',
      note: 'power arrives',
    },
    parts: parts({ hdd: 'idle', ssd: 'idle', firmware: 'idle' }, {
      hdd: 'Magnetic platters — non-volatile storage',
      ssd: 'Flash cells — non-volatile storage',
      firmware: 'Non-volatile chip on the board',
    }),
    ram: ram(0, 0, 'Empty — volatile memory', 'Empty — volatile memory'),
    log: ['PSU: rails stable', 'Motherboard energised'],
    processes: [],
  },
  {
    id: 'cpu-wake',
    phase: 'Power',
    title: 'The CPU wakes',
    caption:
      'Here is our processor. It wakes up knowing nothing at all — its very first instruction has to come from a chip that never forgets.',
    focus: { part: 'cpu', action: 'draw', reveals: ['cpu'], note: 'resets, waits for firmware' },
    parts: parts({ cpu: 'active', hdd: 'idle', ssd: 'idle', firmware: 'idle' }),
    ram: ram(0, 0),
    log: ['CPU: reset vector → firmware'],
    processes: [],
  },
  {
    id: 'firmware',
    phase: 'Firmware',
    title: 'BIOS / UEFI runs',
    caption:
      'This small chip is the BIOS — or UEFI today. Non-volatile memory wired straight to the CPU: it hands over the very first instruction, then gets out of the way.',
    focus: { part: 'firmware', action: 'draw', reveals: ['firmware'], flow: 'firmware-cpu', note: 'the first instruction' },
    parts: parts({ cpu: 'active', firmware: 'active', hdd: 'idle', ssd: 'idle' }),
    ram: ram(0, 0),
    log: ['BIOS/UEFI: initialising chipset'],
    processes: [],
  },
  {
    id: 'post',
    phase: 'POST',
    title: 'POST — power-on self-test',
    caption:
      'Before anything else, the machine tests itself — POST. The CPU pokes the RAM banks, the keyboard, the disks. And look: RAM is still completely empty.',
    focus: { part: 'ram', action: 'draw', reveals: ['ram'], note: 'counting memory…' },
    parts: parts({ cpu: 'active', firmware: 'active', ram: 'active', hdd: 'idle', ssd: 'idle' }, {
      ram: 'Being counted and tested',
    }),
    ram: ram(2, 0, 'Being counted'),
    log: ['POST: CPU OK', 'POST: memory count in progress', 'POST: keyboard detected'],
    processes: [],
  },
  {
    id: 'boot-device',
    phase: 'Bootloader',
    title: 'A boot device is chosen',
    caption:
      'The firmware walks its boot order and reads the first sector of the SSD. The operating system is still asleep on disk — nothing lives in RAM yet.',
    focus: { part: 'ssd', action: 'draw', reveals: ['hdd', 'ssd'], flow: 'disk-cpu', note: 'reading the boot sector' },
    parts: parts({ cpu: 'active', firmware: 'active', hdd: 'active', ssd: 'active' }, {
      hdd: 'Serving the boot sector',
      ssd: 'Serving the boot sector',
    }),
    ram: ram(2, 0),
    log: ['Firmware: boot order → SSD', 'Disk: MBR/GPT read'],
    processes: [],
  },
  {
    id: 'bootloader',
    phase: 'Bootloader',
    title: 'The bootloader lands in RAM',
    caption:
      'That boot sector is tiny — its only job is to load a real bootloader, GRUB or the Windows Boot Manager, into low memory. Watch it fly in from disk.',
    focus: { part: 'ram', action: 'flow', flow: 'disk-ram', note: 'bootloader lands in RAM' },
    parts: parts({ cpu: 'active', firmware: 'active', ram: 'active', hdd: 'active', ssd: 'active' }),
    ram: ram(5, 0, 'Bootloader resident'),
    log: ['Bootloader: GRUB / Windows Boot Manager in memory'],
    processes: [],
  },
  {
    id: 'kernel-load',
    phase: 'Kernel',
    title: 'The OS kernel is loaded into RAM',
    caption:
      'Now the big one. The kernel comes off the disk into a protected zone — kernel space. User programs may never touch this part of memory.',
    focus: { part: 'ram.kernel', action: 'circle', flow: 'disk-ram', note: 'kernel space — protected' },
    parts: parts({ cpu: 'active', ram: 'active', hdd: 'active', ssd: 'active' }, {
      hdd: 'Streaming the kernel image',
      ssd: 'Streaming the kernel image',
    }),
    ram: ram(18, 0, 'Kernel image + initrd'),
    log: ['Bootloader: kernel → kernel space', 'Bootloader: command line passed'],
    processes: [],
  },
  {
    id: 'kernel-takeover',
    phase: 'Kernel',
    title: 'The kernel takes over',
    caption:
      'The bootloader hands the machine to the kernel and stops existing. From this moment, the OS owns the CPU, the memory maps and every device.',
    focus: { part: 'ram.kernel', action: 'point', note: 'the OS owns everything now' },
    parts: parts({ cpu: 'active', ram: 'active', firmware: 'done', hdd: 'active', ssd: 'active' }, {
      firmware: 'Hand-off complete',
    }),
    ram: ram(22, 0, 'Kernel up and running'),
    log: ['Kernel: taking over from the bootloader'],
    processes: [],
  },
  {
    id: 'hardware',
    phase: 'Kernel',
    title: 'Hardware activates',
    caption:
      'Drivers probe every device, and the root filesystem mounts from the SSD — the first real files the OS reads as its own.',
    focus: { part: 'ssd', action: 'point', flow: 'disk-ram', note: 'root filesystem mounted' },
    parts: parts({ cpu: 'active', ram: 'active', hdd: 'active', ssd: 'active' }, {
      hdd: 'Root filesystem mounted',
      ssd: 'Root filesystem mounted',
    }),
    ram: ram(26, 0, 'Drivers + caches'),
    log: ['Kernel: drivers probed', 'Kernel: root filesystem mounted (SSD)'],
    processes: [],
  },
  {
    id: 'user-space',
    phase: 'User space',
    title: 'Kernel space → user space',
    caption:
      'The kernel\u2019s first act: start a process in user space — init on Linux, smss.exe on Windows. Everything you will ever run lives in this lower region.',
    focus: { part: 'ram.user', action: 'circle', note: 'the first process is born' },
    parts: parts({ cpu: 'active', ram: 'active', firmware: 'done', hdd: 'active', ssd: 'active' }),
    ram: ram(26, 8, 'Kernel space — protected', 'First process: init / smss.exe'),
    log: ['Kernel: starting init (Linux) / smss.exe (Windows)'],
    processes: [{ name: 'init / smss.exe', note: 'The first OS process — parent of everything else.' }],
  },
  {
    id: 'services',
    phase: 'User space',
    title: 'Services start',
    caption:
      'Services come up one by one — networking, logging — and each one is its own process, kept apart by the kernel.',
    focus: { part: 'ram.user', action: 'point', note: 'services start' },
    parts: parts({ cpu: 'active', ram: 'active', firmware: 'done', hdd: 'idle', ssd: 'active' }),
    ram: ram(26, 16, undefined, 'Services resident'),
    log: ['init: starting services', 'Services: networking, logging up'],
    processes: [
      { name: 'init / smss.exe', note: 'Parent of everything else.' },
      { name: 'services', note: 'Background processes.' },
    ],
  },
  {
    id: 'gui',
    phase: 'GUI',
    title: 'The GUI starts',
    caption:
      'The graphics stack starts and the screen comes alive — the machine is finally something you can point at.',
    focus: { part: 'monitor', action: 'draw', reveals: ['monitor', 'gui-icons'], note: 'the screen wakes up' },
    parts: parts({ cpu: 'active', ram: 'active', firmware: 'done', ssd: 'active' }, {
      ssd: 'Reading the shell',
    }),
    ram: ram(26, 26, undefined, 'Graphics stack + shell'),
    log: ['GUI: graphics stack up', 'GUI: shell starting'],
    processes: [
      { name: 'init / smss.exe', note: 'Parent of everything else.' },
      { name: 'services', note: 'Background processes.' },
      { name: 'shell', note: 'Draws the desktop.' },
    ],
  },
  {
    id: 'login',
    phase: 'GUI',
    title: 'The login screen',
    caption:
      'Your credentials, please. The OS checks them against its user database — then it starts your session.',
    focus: { part: 'monitor', action: 'circle', reveals: ['login-prompt'], note: 'login screen' },
    parts: parts({ cpu: 'active', ram: 'active', firmware: 'done', ssd: 'active' }),
    ram: ram(26, 30, undefined, 'Login + session'),
    log: ['Login: awaiting credentials', 'Session: started'],
    processes: [
      { name: 'init / smss.exe', note: 'Parent of everything else.' },
      { name: 'services', note: 'Background processes.' },
      { name: 'shell', note: 'Draws the desktop.' },
      { name: 'login', note: 'Asks for your credentials.' },
    ],
  },
  {
    id: 'desktop',
    phase: 'GUI',
    title: 'Desktop ready',
    caption:
      'Booted. Every piece of software you can see is a process in user space, scheduled onto the cores.',
    focus: { part: 'monitor', action: 'point', note: 'desktop ready' },
    parts: parts({ cpu: 'active', ram: 'active', firmware: 'done', ssd: 'idle' }, {
      ssd: 'Idle — programs live here until run',
    }),
    ram: ram(26, 34, undefined, 'Desktop session'),
    log: ['Desktop: ready'],
    processes: [
      { name: 'init / smss.exe', note: 'Parent of everything else.' },
      { name: 'services', note: 'Background processes.' },
      { name: 'shell', note: 'Draws the desktop.' },
    ],
  },
  {
    id: 'launch',
    phase: 'Process',
    title: 'You launch an application',
    caption:
      'You double-click an app — and the OS goes to work: it reads the program image from disk and maps it into a fresh address space. A new process is born.',
    focus: { part: 'monitor', action: 'flow', reveals: ['app-window'], flow: 'disk-user', note: 'program image mapped' },
    parts: parts({ cpu: 'active', ram: 'active', firmware: 'done', hdd: 'active', ssd: 'active' }, {
      hdd: 'Program image being read',
      ssd: 'Program image being read',
    }),
    ram: ram(26, 38, undefined, 'New process mapped in'),
    log: ['Loader: program image mapped', 'OS: process created'],
    processes: [
      { name: 'init / smss.exe', note: 'Parent of everything else.' },
      { name: 'services', note: 'Background processes.' },
      { name: 'shell', note: 'Draws the desktop.' },
      APP_PROCESS,
    ],
  },
  {
    id: 'running',
    phase: 'Process',
    title: 'The process runs — true parallelism',
    caption:
      'The scheduler places your app on a core. Four cores can truly run four things at the same instant — and everything you just watched happened inside this machine.',
    focus: { part: 'cpu', action: 'circle', note: 'your app on core 0' },
    parts: parts({ cpu: 'active', ram: 'active', firmware: 'done', ssd: 'idle' }, {
      cpu: 'Running your app on one core',
    }),
    ram: ram(26, 42, undefined, 'Your app, live in user space'),
    log: ['Scheduler: app → core 0', 'App: running'],
    processes: [
      { name: 'init / smss.exe', note: 'Parent of everything else.' },
      { name: 'services', note: 'Background processes.' },
      { name: 'shell', note: 'Draws the desktop.' },
      APP_PROCESS,
    ],
  },
];