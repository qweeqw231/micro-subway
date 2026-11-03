import { segmentIntersectsPolygon } from './geo';
import type { GameMap, Point } from './types';

export function countWaterCrossings(
  stationIds: string[],
  map: GameMap,
): number {
  const positions = new Map<string, Point>(
    map.stations.map((station) => [station.id, station]),
  );
  let crossings = 0;

  for (let index = 0; index < stationIds.length - 1; index += 1) {
    const from = positions.get(stationIds[index]);
    const to = positions.get(stationIds[index + 1]);
    if (!from || !to) {
      continue;
    }

    if (
      map.water.some((polygon) =>
        segmentIntersectsPolygon(from, to, polygon),
      )
    ) {
      crossings += 1;
    }
  }

  return crossings;
}
