import { Machine } from './Machine';
import s from './desktopStartupVisual.module.css';

const scenes = [
  { title: 'Firmware selects a boot entry', screen: 'Starting firmware', detail: 'Selecting a configured boot entry…', transfer: 'firmware-cpu' },
  { title: 'Windows loader prepares the kernel', screen: 'Loading Windows', detail: 'Loading the kernel and boot drivers…', transfer: 'storage-ram' },
  { title: 'The kernel takes control', screen: 'Starting the kernel', detail: 'Preparing memory and scheduling…', transfer: 'cpu-ram' },
  { title: 'Devices and filesystem are prepared', screen: 'Preparing devices', detail: 'Initializing devices and filesystem…', transfer: 'cpu-ram' },
  { title: 'Userspace services start', screen: 'Starting services', detail: 'Preparing your session…', transfer: 'cpu-ram' },
  { title: 'The desktop session appears', screen: 'Desktop ready', detail: 'An illustrative desktop session is ready.', transfer: 'cpu-ram' },
] as const;

/** The six snapshots correspond to the desktop-startup journey, starting after hardware checks. */
export function DesktopStartupVisual({ scene, playing }: { scene: number; playing: boolean }) {
  const index = Number.isFinite(scene) ? Math.max(0, Math.min(scenes.length - 1, Math.floor(scene))) : 0;
  const current = scenes[index];
  return <div className={s.stage} data-playing={playing}>
    <div className={s.hardware}>
      <div className={s.heading}><span>INSIDE THE MACHINE</span><span>{current.title}</span></div>
      <div className={s.machine}>
        <Machine scene={2} focus="overview" powered event={0} failed={false} readBlock={null} onPower={() => {}} transfer={current.transfer} />
      </div>
      <p className={s.note}>Conceptual activity, not literal timing or wiring.</p>
    </div>
    <div className={s.connection} aria-hidden="true"><span /></div>
    <div className={s.monitorArea}>
      <div className={s.monitor} role="img" aria-label={`Connected monitor: ${current.screen}. ${current.detail} The desktop appearance is illustrative; this journey describes a UEFI and Windows example.`}>
        <div className={s.camera} />
        <div className={`${s.screen} ${index === 5 ? s.desktop : s.bootScreen}`} aria-hidden="true">
          {index < 5 ? <div className={s.bootContent}>
            <div className={s.bootMark}><i /><i /><i /><i /></div>
            <strong>{current.screen}</strong>
            <span>{current.detail}</span>
            <div className={s.spinner} />
          </div> : <>
            <div className={s.wallpaper}><div /><div /></div>
            <div className={s.desktopIcons}><span><b>▣</b>This PC</span><span><b>▤</b>Recycle Bin</span><span><b>◉</b>Browser</span></div>
            <div className={s.taskbar}><div className={s.taskIcons}><b className={s.startIcon}><i /><i /><i /><i /></b><b>⌕</b><b>▰</b><b>◉</b></div><span>◈ &nbsp; ▰ &nbsp; 12:00</span></div>
          </>}
        </div>
      </div>
      <div className={s.stand} aria-hidden="true" /><div className={s.foot} aria-hidden="true" />
      <p className={s.monitorCaption}>Connected display · illustrative desktop</p>
    </div>
  </div>;
}
