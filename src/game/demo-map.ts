import type { GameMap } from './types';

/**
 * Internal test fixture. The playable maps live under src/game/maps/.
 */
export const demoMap: GameMap = {
  id: 'demo',
  nameKey: 'map.tidal.name',
  descKey: 'map.tidal.desc',
  difficultyKey: 'map.difficulty.easy',
  tutorial: false,
  outline: [
    { x: 80, y: 80 },
    { x: 1200, y: 80 },
    { x: 1200, y: 720 },
    { x: 80, y: 720 },
  ],
  water: [],
  parks: [],
  startDayProgress: 0.25,
  demandScale: 1,
  overloadGraceSec: 18,
  stations: [
    { id: 's1', x: 260, y: 420, type: 'residential', appearWeek: 1 },
    { id: 's2', x: 470, y: 300, type: 'work', appearWeek: 1 },
    { id: 's3', x: 700, y: 360, type: 'commercial', appearWeek: 1 },
    { id: 's4', x: 920, y: 520, type: 'residential', appearWeek: 1 },
    { id: 's5', x: 430, y: 620, type: 'leisure', appearWeek: 1 },
    { id: 's6', x: 1030, y: 250, type: 'work', appearWeek: 1 },
  ],
};
