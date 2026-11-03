import type { GameMap } from '../types';
import { oldGrid } from './old-grid';
import { threeRivers } from './three-rivers';
import { tidalBay } from './tidal-bay';

export const GAME_MAPS: GameMap[] = [tidalBay, oldGrid, threeRivers];

export function getMap(id: string): GameMap | undefined {
  return GAME_MAPS.find((map) => map.id === id);
}
