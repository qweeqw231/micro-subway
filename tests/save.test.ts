import { describe, expect, it } from 'vitest';
import { getMap } from '../src/game/maps';
import { params } from '../src/game/params';
import {
  createSaveFile,
  parseSaveFile,
  saveFileName,
} from '../src/game/save/schema';
import { Simulation } from '../src/game/simulation';

const tick = 1 / params.time.tickHz;

describe('Save schema v1', () => {
  it('round-trips a running simulation through JSON', () => {
    const map = getMap('tidal-bay');
    if (!map) {
      throw new Error('Missing tidal bay');
    }

    const simulation = new Simulation(map, 31);
    simulation.createLine(['s1', 's3'], 0);
    for (
      let index = 0;
      index < Math.ceil((params.lines.construction.newLineSec + 5) * params.time.tickHz);
      index += 1
    ) {
      simulation.tick(tick);
    }

    const save = createSaveFile(
      simulation.exportSnapshot(),
      map.id,
      1,
      99,
    );
    const parsed = parseSaveFile(JSON.parse(JSON.stringify(save)));
    const restored = Simulation.fromSnapshot(map, parsed.snapshot);

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.mapId).toBe('tidal-bay');
    expect(parsed.snapshot.cardRngState).toHaveLength(4);
    expect(restored.state.week).toBe(simulation.state.week);
    expect(restored.state.lines).toHaveLength(1);
    expect(restored.state.trains).toHaveLength(params.trains.initialPerLine);
    expect(restored.state.stats.delivered).toBe(simulation.state.stats.delivered);
    expect(restored.state.elapsedSec).toBeCloseTo(simulation.state.elapsedSec);
  });

  it('uses the stable slot filename and rejects unsupported versions', () => {
    expect(saveFileName(2)).toBe('linevale-save-slot2-v1.json');
    expect(() =>
      parseSaveFile({
        schemaVersion: 2,
        mapId: 'old-grid',
        slot: 1,
      }),
    ).toThrow('Unsupported save schema');
  });

  it('loads legacy snapshots without cardRngState', () => {
    const map = getMap('old-grid');
    if (!map) {
      throw new Error('Missing old grid');
    }

    const simulation = new Simulation(map, 32);
    const { cardRngState: _ignored, ...legacySnapshot } =
      simulation.exportSnapshot();
    const restored = Simulation.fromSnapshot(map, legacySnapshot);

    expect(restored.state.week).toBe(simulation.state.week);
    expect(restored.state.lines).toHaveLength(0);
  });
});
