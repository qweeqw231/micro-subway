import { getMap } from '../maps';
import { params } from '../params';
import type { SimSnapshot } from '../types';

export const SAVE_SCHEMA_VERSION = params.save.schemaVersion;
export const SAVE_SLOT_COUNT = params.save.slotCount;

export interface SaveUiState {
  tutorialStep: number;
}

export interface SaveFileV1 {
  schemaVersion: number;
  appVersion: string;
  savedAt: string;
  source: 'web';
  slot: number;
  mapId: string;
  snapshot: SimSnapshot;
  ui: SaveUiState;
}

export function createSaveFile(
  snapshot: SimSnapshot,
  mapId: string,
  slot: number,
  tutorialStep: number,
): SaveFileV1 {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    appVersion: '0.1.0',
    savedAt: new Date().toISOString(),
    source: 'web',
    slot,
    mapId,
    snapshot,
    ui: { tutorialStep },
  };
}

export function parseSaveFile(raw: unknown): SaveFileV1 {
  const migrated = migrateSave(raw);
  if (!isSaveFileV1(migrated)) {
    throw new Error('Invalid Linevale save file');
  }
  return migrated;
}

export function migrateSave(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Save file is not an object');
  }

  const candidate = raw as Record<string, unknown>;
  if (candidate.schemaVersion !== SAVE_SCHEMA_VERSION) {
    throw new Error(`Unsupported save schema: ${String(candidate.schemaVersion)}`);
  }

  return candidate;
}

export function isSaveFileV1(value: unknown): value is SaveFileV1 {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const file = value as Partial<SaveFileV1>;
  return (
    file.schemaVersion === SAVE_SCHEMA_VERSION &&
    typeof file.mapId === 'string' &&
    getMap(file.mapId) !== undefined &&
    typeof file.slot === 'number' &&
    file.slot >= 1 &&
    file.slot <= SAVE_SLOT_COUNT &&
    !!file.snapshot &&
    typeof file.snapshot === 'object' &&
    !!file.snapshot.state &&
    Array.isArray(file.snapshot.rngState) &&
    (file.snapshot.cardRngState === undefined ||
      Array.isArray(file.snapshot.cardRngState))
  );
}

export function saveFileName(slot: number): string {
  return `linevale-save-slot${slot}-v${SAVE_SCHEMA_VERSION}.json`;
}
