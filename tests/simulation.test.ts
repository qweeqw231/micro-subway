import { describe, expect, it } from 'vitest';
import { demoMap } from '../src/game/demo-map';
import { params } from '../src/game/params';
import { findRoute } from '../src/game/routing';
import { Simulation } from '../src/game/simulation';

const tick = 1 / params.time.tickHz;

function runFor(simulation: Simulation, seconds: number): void {
  const steps = Math.ceil(seconds * params.time.tickHz);
  for (let index = 0; index < steps; index += 1) {
    simulation.tick(tick);
  }
}

describe('Simulation M2', () => {
  it('creates a line through construction and then puts a train on it', () => {
    const simulation = new Simulation(demoMap, 1);

    expect(simulation.state.lines).toHaveLength(0);
    expect(simulation.createLine(['s1', 's2'], 0)).toBe('L1');
    expect(simulation.state.lines[0].construction?.kind).toBe('create');
    expect(simulation.state.trains).toHaveLength(0);

    runFor(simulation, params.lines.construction.newLineSec + 0.1);

    expect(simulation.state.lines[0].construction).toBeNull();
    expect(simulation.state.trains).toHaveLength(1);
  });

  it('moves the train after the initial dwell', () => {
    const simulation = new Simulation(demoMap, 2);
    simulation.createLine(['s1', 's2'], 0);
    runFor(simulation, params.lines.construction.newLineSec + 0.1);

    for (let index = 0; index < 200; index += 1) {
      simulation.tick(tick);
    }

    expect(simulation.state.trains[0]?.state).toBe('moving');
  });

  it('spawns and delivers passengers on a connected line', () => {
    const simulation = new Simulation(demoMap, 3);
    simulation.createLine(['s1', 's2'], 0);

    for (let index = 0; index < 3600; index += 1) {
      simulation.tick(tick);
    }

    expect(simulation.state.stats.spawned).toBeGreaterThan(0);
    expect(simulation.state.stats.delivered).toBeGreaterThan(0);
  });

  it('fails when a station stays over capacity for the grace period', () => {
    const simulation = new Simulation(demoMap, 4);
    simulation.createLine(['s1', 's2'], 0);
    runFor(simulation, params.lines.construction.newLineSec + 0.1);

    const station = simulation.state.stations.find((entry) => entry.id === 's3');
    if (!station) {
      throw new Error('Missing demo station s3');
    }

    for (let index = 0; index < station.capacity + 1; index += 1) {
      station.queue.push({
        id: 900 + index,
        destType: 'work',
        targetStationId: 's2',
        spawnedAtSec: 0,
        route: null,
        stepIndex: 0,
      });
    }

    runFor(simulation, demoMap.overloadGraceSec + 0.1);

    expect(simulation.state.failed).toBe(true);
    expect(simulation.state.failureStationId).toBe('s3');
    expect(simulation.getHud().failure?.stationType).toBe('commercial');
  });

  it('routes across two lines with a transfer', () => {
    const simulation = new Simulation(demoMap, 5);
    simulation.createLine(['s2', 's3'], 0);
    simulation.createLine(['s3', 's4', 's5'], 1);
    runFor(simulation, params.lines.construction.newLineSec + 0.1);

    const route = findRoute(simulation.state, 's2', 'residential');

    expect(route).not.toBeNull();
    expect(route?.transfers).toBe(1);
    expect(route?.steps.length).toBeGreaterThanOrEqual(2);
    expect(route?.steps[0].lineId).toBe('L1');
    expect(route?.steps[route.steps.length - 1].toStationId).toBe('s4');
  });

  it('delivers a passenger across a transfer end to end', () => {
    const simulation = new Simulation(demoMap, 9);
    simulation.createLine(['s2', 's3'], 0);
    simulation.createLine(['s3', 's4', 's5'], 1);
    runFor(simulation, params.lines.construction.newLineSec + 0.1);

    for (const station of simulation.state.stations) {
      station.nextSpawnSec = 1_000_000_000;
    }

    const route = findRoute(simulation.state, 's2', 'residential');
    if (!route) {
      throw new Error('Expected a transfer route');
    }

    const station = simulation.state.stations.find((entry) => entry.id === 's2');
    if (!station) {
      throw new Error('Missing demo station s2');
    }

    station.queue.push({
      id: 1000,
      destType: 'residential',
      targetStationId: route.steps[route.steps.length - 1].toStationId,
      spawnedAtSec: 0,
      route,
      stepIndex: 0,
    });

    runFor(simulation, 120);

    expect(simulation.state.stats.delivered).toBeGreaterThan(0);
    expect(
      simulation.state.trains.flatMap((train) => train.passengers).some(
        (passenger) => passenger.id === 1000,
      ),
    ).toBe(false);
  });

  it('applies an edit only after its construction time', () => {
    const simulation = new Simulation(demoMap, 6);
    simulation.createLine(['s1', 's2'], 0);
    runFor(simulation, params.lines.construction.newLineSec + 0.1);

    expect(simulation.appendStation('L1', 's3')).toBe(true);
    expect(simulation.state.lines[0].construction?.kind).toBe('edit');
    expect(simulation.state.lines[0].stationIds).toEqual(['s1', 's2']);

    runFor(
      simulation,
      params.lines.construction.baseSec +
        params.lines.construction.perChangedSegmentSec +
        0.1,
    );

    expect(simulation.state.lines[0].construction).toBeNull();
    expect(simulation.state.lines[0].stationIds).toEqual(['s1', 's2', 's3']);
    expect(simulation.state.trains).toHaveLength(1);
  });

  it('removes a line after its demolition construction', () => {
    const simulation = new Simulation(demoMap, 7);
    simulation.createLine(['s1', 's2'], 0);
    runFor(simulation, params.lines.construction.newLineSec + 0.1);

    expect(simulation.deleteLine('L1')).toBe(true);
    expect(simulation.state.lines[0].construction?.kind).toBe('delete');

    runFor(simulation, params.lines.construction.deleteSec + 0.1);

    expect(simulation.state.lines).toHaveLength(0);
    expect(simulation.state.trains).toHaveLength(0);
  });

  it('rewires the last endpoint after construction', () => {
    const simulation = new Simulation(demoMap, 8);
    simulation.createLine(['s1', 's2'], 0);
    runFor(simulation, params.lines.construction.newLineSec + 0.1);

    expect(simulation.replaceLastStation('L1', 's5')).toBe(true);
    expect(simulation.state.lines[0].construction?.kind).toBe('edit');
    expect(simulation.state.lines[0].stationIds).toEqual(['s1', 's2']);

    runFor(
      simulation,
      params.lines.construction.baseSec +
        params.lines.construction.perChangedSegmentSec * 2 +
        0.1,
    );

    expect(simulation.state.lines[0].construction).toBeNull();
    expect(simulation.state.lines[0].stationIds).toEqual(['s1', 's5']);
    expect(simulation.state.trains).toHaveLength(1);
  });
});
