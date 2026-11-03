/**
 * Tamil captions for the Boot & OS track — Tamil script with the core jargons kept in English
 * (Eden, kernel space, bootloader, POST… are never translated).
 */

export const BOOT_CAPTIONS_TA: Record<string, string> = {
  power: 'பேனலைப் பாருங்கள் — power வந்ததும் எல்லாம் காலியாக எழுகிறது. RAM எதையும் நினைவில் வைக்காது; disk மற்றும் இந்தச் சின்ன firmware chip மட்டுமே எல்லாத் தகவலையும் தெரிந்து வைத்திருக்கின்றன.',
  'cpu-wake': 'இதோ நமது processor. அது எழுந்ததும் எதுவும் தெரியாது — அதன் முதல் instruction எப்போதும் மறக்காத ஒரு chip-லிருந்து தான் வர வேண்டும்.',
  firmware: 'இந்தச் சின்ன chip தான் BIOS — இன்றைக்கு UEFI. Non-volatile memory, CPU-க்கு நேரடியாக இணைக்கப்பட்டது: மிக முதல் instruction-ஐ இது கொடுத்துவிட்டு, தன் வேலை முடிந்ததும் விலகிக்கொள்கிறது.',
  post: 'வேறு எதற்கும் முன், machine தன்னையே சோதிக்கிறது — POST. CPU, RAM banks, keyboard, disks — எல்லாவற்றையும் தொட்டுப் பார்க்கிறது. இதைப் பாருங்கள்: RAM இன்னும் முற்றிலும் காலியாக இருக்கிறது.',
  'boot-device': 'Firmware தனது boot order-ஐப் பின்பற்றி SSD-ன் முதல் sector-ஐப் படிக்கிறது. Operating system இன்னும் disk-ல் தூங்கிக்கொண்டிருக்கிறது — RAM-ல் இன்னும் எதுவும் இல்லை.',
  bootloader: 'அந்த boot sector மிகச் சிறியது — அதன் வேலை ஒன்றே ஒன்று: உண்மையான bootloader-ஐ (GRUB அல்லது Windows Boot Manager) low memory-க்குள் load செய்துவிட்டுப் போவது. Disk-லிருந்து அது பறந்து வருவதைப் பாருங்கள்.',
  'kernel-load': 'இப்போது முக்கியமான பகுதி. Kernel disk-லிருந்து ஒரு பாதுகாக்கப்பட்ட பகுதிக்குள் — kernel space — வருகிறது. User programs இந்தப் பகுதியைத் தொடவே முடியாது.',
  'kernel-takeover': 'Bootloader, machine-ஐ kernel-ிடம் ஒப்படைத்துவிட்டு மறைந்துவிடுகிறது. இந்த நொடியிலிருந்து OS தான் CPU, memory map, எல்லா devices — எல்லாவற்றையும் ஆளுகிறது.',
  hardware: 'Drivers ஒவ்வொரு device-ஐயும் probe செய்கின்றன; root filesystem SSD-லிருந்து mount ஆகிறது — OS தனக்காக முதன்முறையாக உண்மையான files-ஐப் படிக்கிறது.',
  'user-space': 'Kernel-ின் முதல் செயல்: user space-ல் ஒரு process-ஐத் தொடங்குவது — Linux-ல் init, Windows-ல் smss.exe. இனி நீங்கள் run செய்யும் எதுவும் இந்தப் பகுதியில் தான் வாழும்.',
  services: 'Services ஒவ்வொன்றாக எழுகின்றன — networking, logging — ஒவ்வொன்றும் தனித்தனி process-கள்; kernel அவற்றைப் பிரித்து வைத்து, schedule செய்கிறது.',
  gui: 'Graphics stack தொடங்கி, screen உயிர் பெறுகிறது — machine இப்போது நீங்கள் சுட்டிக்காட்டக்கூடிய ஒன்றாக மாறிவிட்டது.',
  login: 'உங்கள் credentials, தயவுசெய்து. OS அவற்றை user database-உடன் சரிபார்த்துவிட்டு — உங்களுக்கான session-ஐத் தொடங்குகிறது.',
  desktop: 'Boot முடிந்தது. நீங்கள் பார்க்கும் ஒவ்வொரு software-ம் user space-ல் ஓர் OS process தான்; cores-களுக்குள் scheduler அவற்றைப் பிரித்துத் தருகிறது.',
  launch: 'நீங்கள் ஒரு app-ஐ double-click செய்கிறீர்கள் — OS உடனேயே வேலைக்குத் தூண்டப்படுகிறது: disk-லிருந்து program image-ஐப் படித்து, ஒர் புதிய address space-ல் map செய்கிறது. ஒர் புதிய process பிறக்கிறது.',
  running: 'Scheduler உங்கள் app-ஐ ஒரு core-ல் வைக்கிறது. நான்கு cores ஒரே நொடியில் நான்கு வேலைகளை உண்மையாகவே இணையாகச் செய்யும் — நீங்கள் இப்போது பார்த்த ஒவ்வொன்றும் இந்த machine-க்குள் நடந்ததே.',
};