import { t } from '../i18n';
import { params } from '../game/params';
import type { HudSnapshot, LineHudInfo } from '../game/types';

interface LineDockProps {
  hud: HudSnapshot;
  selectedLineId: string | null;
  selectedColorIndex: number;
  rewireMode: boolean;
  onSelectSlot: (colorIndex: number) => void;
  onDelete: () => void;
  onRemoveEnd: () => void;
  onRewire: () => void;
}

export function LineDock({
  hud,
  selectedLineId,
  selectedColorIndex,
  rewireMode,
  onSelectSlot,
  onDelete,
  onRemoveEnd,
  onRewire,
}: LineDockProps) {
  const selectedLine =
    hud.lines.find((line) => line.id === selectedLineId) ?? null;

  return (
    <section className="line-dock" aria-label={t('hud.lines', { count: hud.lineCount })}>
      <div className="line-slots">
        {Array.from({ length: hud.lineSlots }, (_, index) => {
          const line = hud.lines.find((entry) => entry.colorIndex === index);
          const color = line?.color ?? params.lines.colors[index];
          const selected = line
            ? selectedLineId === line.id
            : selectedLineId === null && selectedColorIndex === index;
          return (
            <LineSlot
              key={index}
              index={index}
              line={line ?? null}
              color={color}
              selected={selected}
              onSelect={() => onSelectSlot(index)}
            />
          );
        })}
      </div>

      {selectedLine && (
        <div className="line-actions">
          <button
            disabled={
              selectedLine.constructionKind !== null ||
              selectedLine.stationCount <= 2
            }
            onClick={onRemoveEnd}
          >
            {t('line.removeEnd')}
          </button>
          <button
            className={rewireMode ? 'active' : ''}
            disabled={selectedLine.constructionKind !== null}
            onClick={onRewire}
          >
            {t('line.rewireEnd')}
          </button>
          <button
            disabled={selectedLine.constructionKind !== null}
            onClick={onDelete}
          >
            {t('line.delete')}
          </button>
        </div>
      )}
    </section>
  );
}

interface LineSlotProps {
  index: number;
  line: LineHudInfo | null;
  color: string;
  selected: boolean;
  onSelect: () => void;
}

function LineSlot({
  index,
  line,
  color,
  selected,
  onSelect,
}: LineSlotProps) {
  return (
    <button
      className={`line-slot ${selected ? 'selected' : ''} ${line ? 'has-line' : ''}`}
      onClick={onSelect}
    >
      <span className="line-swatch" style={{ background: color }} />
      <span className="line-name">{t('line.slot', { index: index + 1 })}</span>
      <span className="line-meta">
        {line ? t('line.stations', { count: line.stationCount }) : t('line.empty')}
      </span>
      {line?.constructionKind && (
        <span className={`line-construction ${line.constructionKind}`}>
          {t(`line.construction.${line.constructionKind}`, {
            seconds: line.constructionSec.toFixed(1),
          })}
        </span>
      )}
    </button>
  );
}
