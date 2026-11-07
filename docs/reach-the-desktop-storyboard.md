# Storyboard proposal: Reach the desktop

**Status: draft for owner approval. Do not replace or publish the existing chapter until approved.** This builds on the reviewed Inside the machine player and retains its motherboard. Example environment: a typical UEFI PC running Linux with an EFI bootloader, an initramfs, a service manager and a graphical session. These are examples, not universal rules; device initialization and driver loading can occur at different times depending on system configuration. No network request is required.

## Audience goal
Explain why a machine transitions from firmware to a running operating system, and how storage, RAM, CPU and software cooperate. The viewer should be able to distinguish firmware, bootloader, kernel, userspace and desktop applications without mistaking software for physical hardware.

## Storytelling approach
One familiar physical machine remains visible. When helpful, use a retractable, clearly labeled software overlay and a monitor connected to it. The animation depicts *logical activity*, not literal electrons, exact bus wiring, a real PC's boot time or all platform-specific initialization.

Each beat uses the existing shared player: automatic narration/subtitles, synchronized illustrative highlighting, pause/step/replay, opt-in inspection, accessible transcript, reduced motion and admin caption editing. Default experience is a short guided story, not a panel full of text. Existing English/Tamil captions are independently editable; audio or translation never changes another language silently.

## Beat 1 — After the checks: who starts the OS?
**Audience action:** Choose Continue startup after the earlier checks or open this chapter and press Play.

**Stage:** The same motherboard remains on. Firmware is highlighted; storage retains the boot files. A small monitor remains blank.

**Narration draft:** “The hardware checks have finished. The operating system isn't running yet. Firmware now looks for a configured way to start it.”

**Animation:** A labeled control highlight moves from the firmware area to the configured UEFI boot entry. Show *selection*, not the entire operating system moving to the CPU.

**Technical note:** Existing graphics are illustrative. A UEFI entry may launch an EFI application from an EFI system partition; firmware choices and storage paths vary.

## Beat 2 — The bootloader prepares the kernel
**Stage:** Show the EFI application/bootloader as a software label. Persistent storage, RAM and CPU are simultaneously visible.

**Narration draft:** “The bootloader prepares the Linux kernel and, on many systems, an initial RAM filesystem. Their bytes come from storage into memory. Then the bootloader hands control to the kernel.”

**Animation:** A conceptual labeled read from storage through the platform's I/O path to RAM; CPU activity highlights the bootloader as it prepares the handoff. RAM shows the kernel image and optional initramfs, not a claim that all software is loaded at once.

**Interaction:** Tap storage, RAM or CPU to inspect its role. Pause playback while the inspection is open.

## Beat 3 — Meet the kernel
**Stage:** Zoom toward CPU and RAM. Slide in a translucent layer named **Kernel software view**; keep hardware visible behind it.

**Narration draft:** “Now the kernel takes control. Think of it as the operating system's core: it manages memory, schedules runnable threads and coordinates access to devices.”

**Animation:** Show the CPU executing kernel instructions, and a protected address-space illustration. Label kernel space as a *virtual software view*, not a physical RAM compartment.

**Checkpoint:** “Is the kernel a separate chip?” The learner chooses; the explanation returns to the hardware/software distinction.

## Beat 4 — Devices and the root filesystem
**Stage:** The network/storage adapter and the storage device remain recognizable. A software driver appears inside the overlay, not on the motherboard as a physical chip.

**Narration draft:** “Drivers help the operating system work with devices. Early userspace can help locate and mount the root filesystem—the files the system needs to continue.”

**Animation:** Illustrate a driver handling a storage request and a filesystem becoming available. Avoid prescribing an exact driver order or implying that all drivers arrive from disk only at this point.

**Inspection:** Reveal a brief clarification: firmware already initialized some hardware; the kernel and userspace continue device and filesystem setup.

## Beat 5 — The first userspace process and services
**Stage:** The kernel overlay stays visible; small process cards grow *within a labeled software layer*. The CPU remains the same physical component.

**Narration draft:** “The kernel starts the first userspace process. In this example, a service manager starts the system services. Each process has a virtual address space, and the kernel schedules its runnable threads.”

**Animation:** Represent a service manager starting example services; show short CPU time slices, explicitly illustrative and not measured. Do not imply every service is a separate machine or always starts in a fixed order.

**Checkpoint:** “Do these services use a new CPU?” Reveal that they share the physical machine, with controlled memory and scheduling.

## Beat 6 — The desktop appears
**Stage:** The monitor lights up. A labeled graphics/compositor process draws a simulated desktop. The browser icon is visible but not yet running.

**Narration draft:** “The graphical session starts and the desktop appears. The compositor and applications are processes using the same CPU and memory. The OS login shown here is a simulation, separate from your Learn with Saravana account.”

**Animation:** Show process activity producing the monitor image. End with one clear next action: **Launch Chrome**—but do not silently start the next chapter.

## Voice pilot sample
The player settings will offer available browser voices, a short user-initiated sample and 0.85× speed. The sample says:

> “Press the power button. Now, let us follow what happens inside the machine.”

The sample is not recorded audio. Voice quality depends on the installed browser/OS voices; some may use network services. App backend/OpenRouter are not called. Longer sentence-oriented subtitle units and punctuation-based pauses may sound more natural, but cannot guarantee an expressive voice. Tamil voice availability differs by device; captions remain usable when no Tamil voice exists.

## Review and acceptance
- Owner approves the script, terminology, interaction and visual direction before replacing the existing snapshot chapter.
- Technical review against the relevant UEFI and Linux documentation; explain platform differences instead of presenting one path as universal.
- Test play/pause, seek/replay, checkpoint recovery, keyboard, touch, 320px layout, both themes, reduced motion and caption editing.
- Voice changes must not alter stored lesson text or publish a draft. No audio service, model call or user recording is introduced without separate approval.
- User can hear the voice sample and confirm quality in their own browser before any recorded-voice approach is considered.
