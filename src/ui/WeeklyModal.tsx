import { t } from '../i18n';
import type { UpgradeCard, UpgradeKind, WeeklyState } from '../game/types';

interface WeeklyModalProps {
  weekly: WeeklyState;
  tutorialHint?: string;
  onShowCards: () => void;
  onChoose: (cardId: string) => void;
}

export function WeeklyModal({
  weekly,
  tutorialHint,
  onShowCards,
  onChoose,
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

function UpgradeCardButton({
  card,
  onChoose,
}: {
  card: UpgradeCard;
  onChoose: () => void;
}) {
  return (
    <button className="upgrade-card" onClick={onChoose}>
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
