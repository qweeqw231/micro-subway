import { t } from '../i18n';
import type { HudSnapshot, StationType } from '../game/types';

interface HudProps {
  hud: HudSnapshot;
  paused: boolean;
  speed: number;
  hint: string;
  onTogglePause: () => void;
  onToggleSpeed: () => void;
  onRestart: () => void;
}

const LEGEND_TYPES: StationType[] = [
  'residential',
  'work',
  'commercial',
  'leisure',
];

export function Hud({
  hud,
  paused,
  speed,
  hint,
  onTogglePause,
  onToggleSpeed,
  onRestart,
}: HudProps) {
  return (
    <header className="hud">
      <div className="title-block">
        <h1>{t('app.title')}</h1>
        <span className="subtitle">{t('app.subtitle')}</span>
      </div>

      <div className="hud-readouts">
        <span>{t('hud.weekDay', { week: hud.week, day: hud.day, time: hud.clock })}</span>
        <span>{t('hud.delivered', { count: hud.delivered })}</span>
        <span>{t('hud.maxQueue', { count: hud.maxQueue })}</span>
        <span>{t('hud.lines', { count: hud.lineCount })}</span>
        <span>{t('hud.totalStations', { count: hud.totalLineStations })}</span>
      </div>

      <div className="hud-actions">
        <button onClick={onToggleSpeed}>{t('hud.speed', { speed })}</button>
        <button onClick={onTogglePause}>
          {paused ? t('hud.resume') : t('hud.pause')}
        </button>
        <button onClick={onRestart}>{t('hud.restart')}</button>
      </div>

      <div className="legend" aria-label={t('hud.legend')}>
        {LEGEND_TYPES.map((type) => (
          <span className="legend-item" key={type}>
            <span className={`glyph glyph-${type}`} aria-hidden="true" />
            {t(`station.type.${type}`)}
          </span>
        ))}
      </div>

      <p className="hint">{hint}</p>
    </header>
  );
}
