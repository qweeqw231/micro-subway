import { getMap } from '../game/maps';
import { SAVE_SLOT_COUNT } from '../game/save/schema';
import type { SaveSummary } from '../platform/types';
import { t } from '../i18n';

interface SavePanelProps {
  slots: SaveSummary[];
  currentSlot: number;
  onSelectSlot: (slot: number) => void;
  onSave: (slot: number) => void;
  onLoad: (slot: number) => void;
  onExport: (slot: number) => void;
  onImport: (file: File) => void;
  onClose: () => void;
}

export function SavePanel({
  slots,
  currentSlot,
  onSelectSlot,
  onSave,
  onLoad,
  onExport,
  onImport,
  onClose,
}: SavePanelProps) {
  return (
    <div className="save-overlay" role="dialog" aria-modal="true">
      <div className="save-panel">
        <div className="save-head">
          <h2>{t('save.title')}</h2>
          <button onClick={onClose}>{t('save.close')}</button>
        </div>

        <div className="save-slots">
          {Array.from({ length: SAVE_SLOT_COUNT }, (_, index) => {
            const slot = index + 1;
            const summary = slots.find((entry) => entry.slot === slot);
            const map = summary ? getMap(summary.mapId) : undefined;
            return (
              <div
                key={slot}
                className={`save-slot ${currentSlot === slot ? 'selected' : ''}`}
                onClick={() => onSelectSlot(slot)}
              >
                <div className="save-slot-title">
                  <strong>{t('save.slot', { slot })}</strong>
                </div>
                {summary && map ? (
                  <div className="save-slot-meta">
                    <span>{t(map.nameKey)}</span>
                    <span>{t('save.week', { week: summary.week })}</span>
                    <span>
                      {t('save.delivered', { count: summary.delivered })}
                    </span>
                  </div>
                ) : (
                  <div className="save-slot-meta muted">{t('save.empty')}</div>
                )}
                <div className="save-slot-actions">
                  <button onClick={() => onSave(slot)}>{t('save.save')}</button>
                  <button disabled={!summary} onClick={() => onLoad(slot)}>
                    {t('save.load')}
                  </button>
                  <button disabled={!summary} onClick={() => onExport(slot)}>
                    {t('save.export')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="save-import">
          <label className="import-button">
            {t('save.import')}
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onImport(file);
                }
                event.target.value = '';
              }}
            />
          </label>
          <p>{t('save.importHint', { slot: currentSlot })}</p>
        </div>
      </div>
    </div>
  );
}
