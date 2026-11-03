/**
 * Boot & OS timeline — the first simulation track (sketches 1 + 2).
 *
 * Each entry is a full, immutable machine snapshot: what is powered, what is active, how full the
 * RAM regions are and what the boot log says at that instant. `Next` simply moves the pointer.
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
    narration:
      'The power supply energises the motherboard. RAM is volatile — it wakes completely empty. Everything the machine knows lives in the non-volatile parts: the HDD/SSD and the firmware chip.',
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
    narration:
      'The CPU resets its registers and jumps to a fixed address in the firmware. It has no programs of its own — its first instruction always comes from the non-volatile firmware chip.',
    parts: parts({ cpu: 'active', hdd: 'idle', ssd: 'idle', firmware: 'active' }, {
      firmware: 'Hands the CPU its first instruction',
    }),
    ram: ram(0, 0),
    log: ['CPU: reset vector → firmware', 'CPU: executing firmware'],
    processes: [],
  },
  {
    id: 'firmware',
    phase: 'Firmware',
    title: 'BIOS / UEFI runs',
    narration:
      'The firmware (BIOS on older boards, UEFI today) is the first software that runs. It knows nothing about your OS yet — its job is to wake the hardware and find something to boot.',
    parts: parts({ cpu: 'active', firmware: 'active', hdd: 'idle', ssd: 'idle' }),
    ram: ram(0, 0),
    log: ['BIOS/UEFI: initialising chipset', 'BIOS/UEFI: preparing hardware hand-off'],
    processes: [],
  },
  {
    id: 'post',
    phase: 'POST',
    title: 'POST — power-on self-test',
    narration:
      'Before anything else, the machine tests itself: the CPU probes the RAM banks, checks the keyboard and confirms a boot device is present. POST is why a faulty RAM stick stops a PC dead.',
    parts: parts({ cpu: 'active', firmware: 'active', ram: 'active', hdd: 'idle', ssd: 'idle' }, {
      ram: 'Being counted and tested',
    }),
    ram: ram(2, 0, 'Being counted', undefined),
    log: ['POST: CPU OK', 'POST: memory count in progress', 'POST: keyboard detected'],
    processes: [],
  },
  {
    id: 'boot-device',
    phase: 'Bootloader',
    title: 'A boot device is chosen',
    narration:
      'The firmware walks its boot order and reads the first sector of the SSD/HDD (the MBR or GPT). The OS itself is still on disk — nothing is in RAM yet.',
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
    narration:
      'The boot sector is tiny, so its only job is to load a real bootloader — GRUB on Linux, the Windows Boot Manager — from disk into low RAM and jump to it.',
    parts: parts({ cpu: 'active', firmware: 'active', ram: 'active', hdd: 'active', ssd: 'active' }),
    ram: ram(5, 0, 'Bootloader resident'),
    log: ['Bootloader: GRUB / Windows Boot Manager in memory'],
    processes: [],
  },
  {
    id: 'kernel-load',
    phase: 'Kernel',
    title: 'The OS kernel is loaded into RAM',
    narration:
      'The bootloader finds the OS kernel on disk (vmlinuz on Linux, ntoskrnl on Windows) and copies it into a protected region of RAM — kernel space — which user programs may never touch.',
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
    narration:
      'The bootloader hands the machine to the kernel and stops existing. From here the OS owns the CPU, the memory maps and every device.',
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
    narration:
      'The kernel loads drivers and probes every device, then mounts the root filesystem from the SSD/HDD — the first time the OS reads real files as its own.',
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
    narration:
      'The kernel starts its very first process in user space: `init`/`systemd` on Linux, `smss.exe` on Windows. Everything you ever run from now on is a process in user space, scheduled by the kernel.',
    parts: parts({ cpu: 'active', ram: 'active', firmware: 'done', hdd: 'active', ssd: 'active' }),
    ram: ram(26, 8, 'Kernel space — protected', 'First process: init / smss.exe'),
    log: ['Kernel: starting init (Linux) / smss.exe (Windows)'],
    processes: [{ name: 'init / smss.exe', note: 'The first OS process — parent of everything else.' }],
  },
  {
    id: 'services',
    phase: 'User space',
    title: 'Services start',
    narration:
      'User-space services come up one by one — networking, logging, device services. Each is its own process with its own address space.',
    parts: parts({ cpu: 'active', ram: 'active', firmware: 'done', hdd: 'idle', ssd: 'active' }),
    ram: ram(26, 16, undefined, 'Services resident'),
    log: ['init: starting services', 'Services: networking, logging up'],
    processes: [
      { name: 'init / smss.exe', note: 'Parent of everything else.' },
      { name: 'services', note: 'Background processes started by the system.' },
    ],
  },
  {
    id: 'gui',
    phase: 'GUI',
    title: 'The GUI starts',
    narration:
      'The graphics stack and the desktop shell initialise. This is the moment the machine becomes something you can point at.',
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
    narration:
      'You feed the machine your credentials; the OS checks them against its user database and starts *your* session.',
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
    narration:
      'The machine is booted. Every piece of software you see is a process in user space, kept apart by the kernel and scheduled onto the CPU cores.',
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
    narration:
      'Double-click an app and the OS goes to work: it reads the program image from disk, maps it into a fresh user-space address space, and creates a new process for it.',
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
    narration:
      'The scheduler places the new process on a core. With multiple cores, independent processes run at the same time on different cores — true parallelism — while a single core shares itself between many through time slicing. From boot to app, every step you just watched happened inside this machine.',
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
