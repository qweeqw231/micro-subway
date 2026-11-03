import { params } from './params';
import type { DemoMap } from './types';

/**
 * Temporary M1 map: six hand-placed stations, no art, no additional maps.
 * Final three maps arrive in M3.
 */
export const demoMap: DemoMap = {
  id: 'demo',
  startDayProgress: 0.25,
  demandScale: params.maps['old-grid'].demandScale,
  overloadGraceSec: params.stations.overloadGraceSec,
  stations: [
    { id: 's1', x: 260, y: 420, type: 'residential' },
    { id: 's2', x: 470, y: 300, type: 'work' },
    { id: 's3', x: 700, y: 360, type: 'commercial' },
    { id: 's4', x: 920, y: 520, type: 'residential' },
    { id: 's5', x: 430, y: 620, type: 'leisure' },
    { id: 's6', x: 1030, y: 250, type: 'work' },
  ],
};
