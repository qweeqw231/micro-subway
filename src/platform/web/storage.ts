import {
  parseSaveFile,
  SAVE_SCHEMA_VERSION,
  SAVE_SLOT_COUNT,
  type SaveFileV1,
} from '../../game/save/schema';
import type { SaveRepository, SaveSummary } from '../types';

const KEY_PREFIX = 'linevale.save.slot';

function slotKey(slot: number): string {
  return `${KEY_PREFIX}${slot}`;
}

function readJson(slot: number): SaveFileV1 | null {
  try {
    const raw = window.localStorage.getItem(slotKey(slot));
    if (!raw) {
      return null;
    }
    return parseSaveFile(JSON.parse(raw));
  } catch {
    return null;
  }
}

export const webSaveRepository: SaveRepository = {
  list(): SaveSummary[] {
    const summaries: SaveSummary[] = [];
    for (let slot = 1; slot <= SAVE_SLOT_COUNT; slot += 1) {
      const save = readJson(slot);
      if (save) {
        summaries.push({
          slot,
          mapId: save.mapId,
          week: save.snapshot.state.week,
          delivered: save.snapshot.state.stats.delivered,
          savedAt: save.savedAt,
          schemaVersion: SAVE_SCHEMA_VERSION,
        });
      }
    }
    return summaries;
  },

  read(slot: number): SaveFileV1 | null {
    return readJson(slot);
  },

  write(slot: number, save: SaveFileV1): void {
    window.localStorage.setItem(slotKey(slot), JSON.stringify(save));
  },

  backup(slot: number): void {
    const current = window.localStorage.getItem(slotKey(slot));
    if (!current) {
      return;
    }
    window.localStorage.setItem(
      `${slotKey(slot)}.backup-${Date.now()}`,
      current,
    );
  },

  remove(slot: number): void {
    window.localStorage.removeItem(slotKey(slot));
  },
};
