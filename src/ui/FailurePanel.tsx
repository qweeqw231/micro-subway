import { t } from '../i18n';
import type { FailureInfo } from '../game/types';

interface FailurePanelProps {
  failure: FailureInfo;
  delivered: number;
  onRestart: () => void;
}

export function FailurePanel({
  failure,
  delivered,
  onRestart,
}: FailurePanelProps) {
  const stationLabel = t('station.label', {
    type: t(`station.type.${failure.stationType}`),
  });

  return (
    <div className="failure-overlay" role="dialog" aria-modal="true">
      <div className="failure-panel">
        <h2>{t('failure.title')}</h2>
        <p>
          {t('failure.reason', {
            station: stationLabel,
            queue: failure.queue,
            capacity: failure.capacity,
            seconds: failure.seconds,
          })}
        </p>
        <p className="muted">{t('failure.stats', { delivered })}</p>
        <button className="primary" onClick={onRestart}>
          {t('failure.restart')}
        </button>
      </div>
    </div>
  );
}
