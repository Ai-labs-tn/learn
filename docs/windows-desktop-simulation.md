# Reach the desktop: Windows startup simulation

This chapter continues the physical machine from Inside the machine, with the same illustrative motherboard, CPU, RAM, firmware, SSD/HDD, power supply and network adapter. A connected monitor shows an original Windows 11-inspired startup and desktop. It is an educational illustration, not a live trace, a precise electrical schematic, an exact recreation of Windows, or a measurement of boot time. Graphics hardware may be integrated or separate; actual devices, signals and startup order vary.

## Story

1. After the hardware checks, UEFI selects a configured Windows Boot Manager entry on the system drive.
2. Windows Boot Manager starts the Windows loader, which prepares the kernel and boot-start drivers in RAM and transfers control.
3. The CPU executes the kernel, which starts managing memory, threads and hardware access.
4. Windows and drivers continue initializing devices and the system filesystem. Network is not required for this illustration.
5. Windows session processes and services start; their threads share CPU resources.
6. After sign-in, desktop processes and the graphics system prepare an image, and graphics hardware sends a display signal to the monitor. The displayed session is simulated and is unrelated to the learner's real Windows or website account.

The chapter uses the existing shared player, captions and narration. Motion and data-flow paths are conceptual, not literal electrical signals. The chapter's new caption document ID is `journey-desktop-startup-windows`: previously published `journey-desktop-startup` Linux captions and drafts remain stored separately and are not silently reused, migrated or overwritten. An administrator can review and edit English and Tamil independently in the new document.
