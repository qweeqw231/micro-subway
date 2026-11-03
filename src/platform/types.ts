import type { SaveFileV1 } from '../game/save/schema';

export interface SaveSummary {
  slot: number;
  mapId: string;
  week: number;
  delivered: number;
  savedAt: string;
  schemaVersion: number;
}

export interface SaveRepository {
  list(): SaveSummary[];
  read(slot: number): SaveFileV1 | null;
  write(slot: number, save: SaveFileV1): void;
  backup(slot: number): void;
  remove(slot: number): void;
}
