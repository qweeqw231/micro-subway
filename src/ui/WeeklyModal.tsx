import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { params } from '../game/params';
import type {
  HudSnapshot,
  UpgradeCard,
  UpgradeKind,
  WeeklyState,
} from '../game/types';

interface WeeklyModalProps {
  hud: HudSnapshot;
  weekly: WeeklyState;
  tutorialHint?: string;
  onShowCards: () => void;
  onChoose: (cardId: string) => void;
  onConfirm: (targetIds: string[]) => void;
}

export function WeeklyModal({
  hud,
  weekly,
  tutorialHint,
  onShowCards,
  onChoose,
  onConfirm,
}: WeeklyModalProps) {
  if (weekly.phase === 'summary') {
    return (
      <div className="weekly-overlay" role="dialog" aria-modal="true">
        <div className="weekly-panel">
          <h2>
            {t('weekly.summaryTitle', { week: weekly.summary.completedWeek })}
          </h2>
          {tutorialHint && <p className="tutorial-hint">{tutorialHint}</p>}
          <div className="weekly-stats">
            <span>
              {t('weekly.summaryDelivered', {
                count: weekly.summary.delivered,
              })}
            </span>
            <span>
              {t('weekly.summaryQueue', { count: weekly.summary.maxQueue })}
            </span>
            <span>
              {t('weekly.summaryNewStations', {
                count: weekly.summary.newStations,
              })}
            </span>
          </div>
          <button className="primary" onClick={onShowCards}>
            {t('weekly.choose')}
          </button>
        </div>
      </div>
    );
  }

  if (weekly.phase === 'target') {
    return (
      <TargetPicker
        hud={hud}
        weekly={weekly}
        onConfirm={onConfirm}
      />
    );
  }

  return (
    <div className="weekly-overlay" role="dialog" aria-modal="true">
      <div className="weekly-panel">
        <h2>{t('weekly.cardsTitle')}</h2>
        <p className="muted">{t('weekly.cardsHint')}</p>
        <div className="upgrade-cards">
          {weekly.cards.map((card) => (
            <UpgradeCardButton
              key={card.id}
              card={card}
              onChoose={() => onChoose(card.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TargetPicker({
  hud,
  weekly,
  onConfirm,
}: {
  hud: HudSnapshot;
  weekly: WeeklyState;
  onConfirm: (targetIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(weekly.defaultTargetIds);

  useEffect(() => {
    if (weekly.phase === 'target') {
      setSelected(weekly.defaultTargetIds);
    }
  }, [weekly.phase, weekly.selectedCard?.id]);

  if (!weekly.selectedCard || !weekly.targetKind) {
    return null;
  }

  const isStations = weekly.targetKind === 'stations';
  const maxSelections = isStations
    ? params.stations.stationsPerExpansion
    : 1;
  const cardKind = weekly.selectedCard.kind;
  const lines = hud.lines.filter((line) => {
    if (line.removing || line.stationCount < 2) {
      return false;
    }
    if (cardKind === 'train') {
      return line.trainCount < params.trains.maxTrainsPerLine;
    }
    if (cardKind === 'carriage') {
      return line.carriageLevel < params.upgrades.caps.carriageMaxPerLine;
    }
    if (cardKind === 'speed') {
      return line.speedStacks < params.upgrades.caps.speedMaxStacks;
    }
    return true;
  });
  const stations = hud.stations.filter(
    (station) =>
      station.active &&
      station.capacity < params.upgrades.caps.stationCapacityMax,
  );

  const toggle = (id: string) => {
    if (!isStations) {
      setSelected([id]);
      return;
    }
    if (selected.includes(id)) {
      setSelected(selected.filter((entry) => entry !== id));
    } else if (selected.length < maxSelections) {
      setSelected([...selected, id]);
    }
  };

  const required = isStations ? params.stations.stationsPerExpansion : 1;
  const canConfirm = selected.length >= required;

  return (
    <div className="weekly-overlay" role="dialog" aria-modal="true">
      <div className="weekly-panel target-panel">
        <h2>{t('weekly.targetTitle')}</h2>
        <p className="muted">
          {isStations ? t('weekly.targetStations') : t('weekly.targetLine')}
        </p>
        <div className="target-options">
          {isStations
            ? stations.map((station) => {
                const lineSelected = selected.includes(station.id);
                return (
                  <button
                    key={station.id}
                    className={`target-option ${lineSelected ? 'selected' : ''}`}
                    onClick={() => toggle(station.id)}
                  >
                    <span className={`glyph glyph-${station.type}`} aria-hidden="true" />
                    <strong>{t(`station.type.${station.type}`)}</strong>
                    <span>
                      {t('station.queueShort', {
                        queue: station.queue,
                        capacity: station.capacity,
                      })}
                    </span>
                  </button>
                );
              })
            : lines.map((line) => {
                const lineSelected = selected.includes(line.id);
                return (
                  <button
                    key={line.id}
                    className={`target-option ${lineSelected ? 'selected' : ''}`}
                    onClick={() => toggle(line.id)}
                  >
                    <span className="line-swatch" style={{ background: line.color }} />
                    <strong>{t('line.slot', { index: line.colorIndex + 1 })}</strong>
                    <span>
                      {t('line.stations', { count: line.stationCount })} ·{' '}
                      {t('line.trainCount', { count: line.trainCount })}
                    </span>
                  </button>
                );
              })}
        </div>
        <button className="primary" disabled={!canConfirm} onClick={() => onConfirm(selected)}>
          {t('weekly.confirm')}
        </button>
      </div>
    </div>
  );
}

function UpgradeCardButton({
  card,
  onChoose,
}: {
  card: UpgradeCard;
  onChoose: () => void;
}) {
  return (
    <button
      className="upgrade-card"
      data-kind={card.kind}
      onClick={onChoose}
    >
      <UpgradeIcon kind={card.kind} />
      <strong>{t(`upgrade.${card.kind}.name`)}</strong>
      <span>{t(`upgrade.${card.kind}.desc`)}</span>
    </button>
  );
}

function UpgradeIcon({ kind }: { kind: UpgradeKind }) {
  const common = {
    width: 34,
    height: 34,
    viewBox: '0 0 48 48',
    'aria-hidden': true,
  } as const;

  if (kind === 'train') {
    return (
      <svg {...common}>
        <rect x="8" y="10" width="32" height="24" rx="6" fill="#0072B2" />
        <circle cx="15" cy="38" r="4" fill="#20242B" />
        <circle cx="33" cy="38" r="4" fill="#20242B" />
      </svg>
    );
  }
  if (kind === 'carriage') {
    return (
      <svg {...common}>
        <rect x="4" y="14" width="24" height="20" rx="4" fill="#D55E00" />
        <rect x="31" y="14" width="13" height="20" rx="4" fill="#E69F00" />
      </svg>
    );
  }
  if (kind === 'lineSlot') {
    return (
      <svg {...common}>
        <path d="M6 36 L18 12 L30 36 L42 12" stroke="#009E73" strokeWidth="5" fill="none" />
      </svg>
    );
  }
  if (kind === 'bridge') {
    return (
      <svg {...common}>
        <path d="M4 34 Q24 8 44 34" stroke="#0072B2" strokeWidth="5" fill="none" />
        <path d="M9 34 L9 40 M39 34 L39 40" stroke="#20242B" strokeWidth="3" />
      </svg>
    );
  }
  if (kind === 'stationExpansion') {
    return (
      <svg {...common}>
        <circle cx="24" cy="24" r="16" fill="none" stroke="#20242B" strokeWidth="3" />
        <circle cx="24" cy="24" r="7" fill="#CC79A7" />
      </svg>
    );
  }
  if (kind === 'speed') {
    return (
      <svg {...common}>
        <path d="M8 16 L24 24 L8 32" stroke="#D55E00" strokeWidth="5" fill="none" />
        <path d="M24 16 L40 24 L24 32" stroke="#D55E00" strokeWidth="5" fill="none" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M24 6 L40 12 V24 C40 34 32 40 24 43 C16 40 8 34 8 24 V12 Z" fill="#009E73" />
      <path d="M16 24 L23 31 L33 18" stroke="#FFFDF7" strokeWidth="4" fill="none" />
    </svg>
  );
}
