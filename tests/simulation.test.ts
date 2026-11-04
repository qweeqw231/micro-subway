import { describe, expect, it } from 'vitest';
import { demoMap } from '../src/game/demo-map';
import { GAME_MAPS, getMap } from '../src/game/maps';
import { countWaterCrossings } from '../src/game/map-utils';
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

function keepOnlyActive(simulation: Simulation, activeIds: string[]): void {
  for (const station of simulation.state.stations) {
    station.active = activeIds.includes(station.id);
  }
}

describe('Simulation M3', () => {
  it('ships three maps with expected graces and water', () => {
    expect(GAME_MAPS).toHaveLength(3);
    expect(GAME_MAPS.map((map) => map.overloadGraceSec)).toEqual([24, 18, 18]);
    expect(GAME_MAPS.every((map) => map.water.length > 0)).toBe(true);
  });

  it('blocks water crossings when bridge capacity is exhausted', () => {
    const tidal = getMap('tidal-bay');
    if (!tidal) {
      throw new Error('Missing tidal bay');
    }

    expect(countWaterCrossings(['s1', 's3'], tidal)).toBeGreaterThan(0);
    const simulation = new Simulation(tidal, 20);
    simulation.state.bridgeCapacity = 0;

    expect(simulation.createLine(['s1', 's3'], 0)).toBeNull();
    expect(simulation.lastActionError).toBe('bridge');

    simulation.state.bridgeCapacity = 2;
    expect(simulation.createLine(['s1', 's3'], 0)).toBe('L1');
  });

  it('raises station capacity only through station-expansion upgrades', () => {
    const simulation = new Simulation(demoMap, 24);
    expect(simulation.state.stations[0].capacity).toBe(
      params.stations.capacity,
    );

    simulation.state.weekly = {
      phase: 'cards',
      summary: {
        completedWeek: 1,
        delivered: 0,
        maxQueue: 0,
        newStations: 0,
      },
      cards: [{ id: 'card-exp', kind: 'stationExpansion' }],
      selectedCard: null,
      targetKind: null,
      defaultTargetIds: [],
    };
    simulation.chooseUpgrade('card-exp');
    expect(simulation.state.weekly?.targetKind).toBe('stations');
    simulation.confirmUpgradeTarget(['s1', 's2']);

    expect(simulation.state.stations.find((station) => station.id === 's1')?.capacity).toBe(
      params.stations.capacity + params.stations.capacityPerExpansion,
    );
  });

  it('reads trains.initialPerLine when a new line finishes construction', () => {
    const simulation = new Simulation(demoMap, 26);
    const original = params.trains.initialPerLine;
    (params.trains as { initialPerLine: number }).initialPerLine = 3;
    try {
      simulation.createLine(['s1', 's3'], 0);
      runFor(simulation, params.lines.construction.newLineSec + 0.1);
      expect(simulation.state.trains).toHaveLength(3);
    } finally {
      (params.trains as { initialPerLine: number }).initialPerLine = original;
    }
  });

  it('keeps spawn and card RNG streams independent', () => {
    const withSpawns = new Simulation(demoMap, 32);
    const withoutSpawns = new Simulation(demoMap, 32);
    keepOnlyActive(withoutSpawns, []);

    runFor(withSpawns, 1);
    runFor(withoutSpawns, 1);

    const withSpawnState = withSpawns.exportSnapshot();
    const withoutSpawnState = withoutSpawns.exportSnapshot();

    expect(withSpawnState.rngState).not.toEqual(withoutSpawnState.rngState);
    expect(withSpawnState.cardRngState).toEqual(withoutSpawnState.cardRngState);
  });

  it('skips maxed stations and capped lines when suggesting upgrade targets', () => {
    const simulation = new Simulation(demoMap, 25);
    const s1 = simulation.state.stations.find((station) => station.id === 's1');
    if (!s1) {
      throw new Error('Missing station s1');
    }
    s1.capacity = params.upgrades.caps.stationCapacityMax;
    simulation.state.weekly = {
      phase: 'cards',
      summary: {
        completedWeek: 1,
        delivered: 0,
        maxQueue: 0,
        newStations: 0,
      },
      cards: [{ id: 'card-exp', kind: 'stationExpansion' }],
      selectedCard: null,
      targetKind: null,
      defaultTargetIds: [],
    };
    simulation.chooseUpgrade('card-exp');
    expect(simulation.state.weekly?.defaultTargetIds).not.toContain('s1');

    simulation.state.weekly = null;
    simulation.createLine(['s1', 's3'], 0);
    simulation.createLine(['s4', 's6'], 1);
    runFor(simulation, params.lines.construction.newLineSec + 0.1);
    simulation.state.lines[0].speedStacks = params.upgrades.caps.speedMaxStacks;
    simulation.state.weekly = {
      phase: 'cards',
      summary: {
        completedWeek: 1,
        delivered: 0,
        maxQueue: 0,
        newStations: 0,
      },
      cards: [{ id: 'card-speed', kind: 'speed' }],
      selectedCard: null,
      targetKind: null,
      defaultTargetIds: [],
    };
    simulation.chooseUpgrade('card-speed');
    expect(simulation.state.weekly?.defaultTargetIds).toEqual(['L2']);
  });

  it('lets the player pick a different line target after choosing a card', () => {
    const simulation = new Simulation(demoMap, 22);
    simulation.createLine(['s1', 's3'], 0);
    simulation.createLine(['s4', 's6'], 1);
    runFor(simulation, params.lines.construction.newLineSec + 0.1);
    keepOnlyActive(simulation, ['s1', 's3', 's4', 's6']);
    runFor(simulation, params.time.daySeconds * params.time.weekDays + 0.2);

    simulation.advanceWeeklyToCards();
    simulation.state.weekly!.cards = [{ id: 'card-train', kind: 'train' }];
    simulation.chooseUpgrade('card-train');

    expect(simulation.state.weekly?.phase).toBe('target');
    expect(simulation.state.weekly?.targetKind).toBe('line');

    simulation.confirmUpgradeTarget(['L2']);

    expect(simulation.state.weekly).toBeNull();
    expect(
      simulation.state.trains.filter((train) => train.lineId === 'L2'),
    ).toHaveLength(params.trains.initialPerLine + 1);
  });

  it('stops at the week boundary and applies an upgrade before week two', () => {
    const tidal = getMap('tidal-bay');
    if (!tidal) {
      throw new Error('Missing tidal bay');
    }

    const simulation = new Simulation(tidal, 21);
    keepOnlyActive(simulation, []);
    runFor(simulation, params.time.daySeconds * params.time.weekDays + 0.2);

    expect(simulation.state.week).toBe(2);
    expect(simulation.state.weekly?.phase).toBe('summary');
    expect(simulation.state.weekly?.summary.newStations).toBe(1);
    expect(simulation.state.weekly?.cards.length).toBe(
      params.upgrades.cardsPerWeek,
    );

    simulation.advanceWeeklyToCards();
    expect(simulation.state.weekly?.phase).toBe('cards');

    simulation.state.weekly!.cards = [{ id: 'bridge', kind: 'bridge' }];
    simulation.chooseUpgrade('bridge');

    expect(simulation.state.weekly).toBeNull();
    expect(simulation.state.bridgeCapacity).toBe(3);
    expect(
      simulation.state.stations.find((station) => station.id === 's7')?.active,
    ).toBe(true);
    expect(simulation.state.unlockedLineSlots).toBe(3);
  });
});

describe('Simulation M2', () => {
  it('creates a line through construction and then puts a train on it', () => {
    const simulation = new Simulation(demoMap, 1);

    expect(simulation.state.lines).toHaveLength(0);
    expect(simulation.createLine(['s1', 's2'], 0)).toBe('L1');
    expect(simulation.state.lines[0].construction?.kind).toBe('create');
    expect(simulation.state.trains).toHaveLength(0);

    runFor(simulation, params.lines.construction.newLineSec + 0.1);

    expect(simulation.state.lines[0].construction).toBeNull();
    expect(simulation.state.trains).toHaveLength(params.trains.initialPerLine);
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
    keepOnlyActive(simulation, ['s1', 's2']);

    for (let index = 0; index < 3600; index += 1) {
      simulation.tick(tick);
    }

    expect(simulation.state.stats.spawned).toBeGreaterThan(0);
    expect(simulation.state.stats.delivered).toBeGreaterThan(0);
  });

  it('fails when an active station is never connected', () => {
    const grid = getMap('old-grid');
    if (!grid) {
      throw new Error('Missing old grid');
    }

    const simulation = new Simulation(grid, 23);
    keepOnlyActive(simulation, ['s1', 's2']);
    for (const station of simulation.state.stations) {
      if (station.active) {
        station.capacity = 10;
      }
    }
    runFor(simulation, 141);

    expect(simulation.state.weekly?.phase).toBe('summary');
    simulation.advanceWeeklyToCards();
    const card = simulation.state.weekly!.cards[0];
    simulation.chooseUpgrade(card.id);
    if (simulation.state.weekly?.phase === 'target') {
      simulation.confirmUpgradeTarget(simulation.state.weekly.defaultTargetIds);
    }
    keepOnlyActive(simulation, ['s1', 's2']);
    for (const station of simulation.state.stations) {
      if (station.active) {
        station.capacity = params.stations.capacity;
      }
    }
    runFor(simulation, 40);

    expect(simulation.state.failed).toBe(true);
    expect(simulation.state.failureStationId).toBeTruthy();
    expect(simulation.state.stats.spawned).toBeGreaterThan(0);
  });

  it('fails when a station stays over capacity for the grace period', () => {
    const simulation = new Simulation(demoMap, 4);
    simulation.createLine(['s1', 's2'], 0);
    keepOnlyActive(simulation, ['s1', 's2']);
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
        rerouteCheck: false,
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
    keepOnlyActive(simulation, ['s2', 's3', 's4', 's5']);

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
      rerouteCheck: false,
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
    expect(simulation.state.trains).toHaveLength(params.trains.initialPerLine);
  });

  it('moves waiting passengers to a newly built direct line', () => {
    const simulation = new Simulation(demoMap, 10);
    simulation.createLine(['s2', 's3', 's4'], 0);
    runFor(simulation, params.lines.construction.newLineSec + 0.1);

    for (const station of simulation.state.stations) {
      station.nextSpawnSec = 1_000_000_000;
    }

    const station = simulation.state.stations.find((entry) => entry.id === 's2');
    if (!station) {
      throw new Error('Missing demo station s2');
    }

    const oldRoute = findRoute(simulation.state, 's2', 'residential');
    if (!oldRoute) {
      throw new Error('Expected an old route');
    }

    station.queue.push({
      id: 2000,
      destType: 'residential',
      targetStationId: 's4',
      spawnedAtSec: 0,
      route: oldRoute,
      stepIndex: 0,
      rerouteCheck: false,
    });

    const train = simulation.state.trains.find((entry) => entry.lineId === 'L1');
    if (train) {
      train.dwellSec = 1000;
    }

    simulation.createLine(['s2', 's4'], 1);
    runFor(simulation, params.lines.construction.newLineSec + 0.1);

    const passenger = station.queue.find((entry) => entry.id === 2000);
    expect(passenger?.route?.steps[0].lineId).toBe('L2');
    expect(passenger?.route?.steps).toHaveLength(1);
  });

  it('reroutes an onboard passenger at the next station', () => {
    const simulation = new Simulation(demoMap, 11);
    simulation.createLine(['s2', 's3', 's4', 's5'], 0);
    runFor(simulation, params.lines.construction.newLineSec + 0.1);
    keepOnlyActive(simulation, ['s2', 's3', 's4', 's5']);

    for (const station of simulation.state.stations) {
      station.nextSpawnSec = 1_000_000_000;
    }

    const oldRoute = findRoute(simulation.state, 's2', 'leisure');
    if (!oldRoute) {
      throw new Error('Expected an old route');
    }

    const train = simulation.state.trains.find((entry) => entry.lineId === 'L1');
    if (!train) {
      throw new Error('Missing line 1 train');
    }

    train.passengers.push({
      id: 3000,
      destType: 'leisure',
      targetStationId: 's5',
      spawnedAtSec: 0,
      route: oldRoute,
      stepIndex: 0,
      rerouteCheck: false,
    });

    simulation.createLine(['s3', 's5'], 1);
    runFor(simulation, 120);

    expect(simulation.state.stats.delivered).toBeGreaterThan(0);
    expect(
      simulation.state.trains.flatMap((entry) => entry.passengers).some(
        (passenger) => passenger.id === 3000,
      ),
    ).toBe(false);
  });

  it('puts onboard passengers at the next station when deleting the line', () => {
    const simulation = new Simulation(demoMap, 12);
    simulation.createLine(['s1', 's2'], 0);
    runFor(simulation, params.lines.construction.newLineSec + 0.1);

    const train = simulation.state.trains[0];
    train.dwellSec = 0;
    train.passengers.push({
      id: 4000,
      destType: 'work',
      targetStationId: 's2',
      spawnedAtSec: 0,
      route: null,
      stepIndex: 0,
      rerouteCheck: false,
    });

    simulation.deleteLine('L1');
    runFor(simulation, 10);

    const nextStation = simulation.state.stations.find((entry) => entry.id === 's2');
    expect(nextStation?.queue.some((passenger) => passenger.id === 4000)).toBe(true);
  });

  it('keeps train direction monotonic when the current station is removed', () => {
    const simulation = new Simulation(demoMap, 13);
    simulation.createLine(['s1', 's2', 's3'], 0);
    runFor(simulation, params.lines.construction.newLineSec + 0.1);

    const train = simulation.state.trains[0];
    train.currentIndex = 2;
    train.nextIndex = 1;
    train.direction = -1;
    train.state = 'dwell';
    train.dwellSec = 1000;

    simulation.replaceLastStation('L1', 's5');
    runFor(
      simulation,
      params.lines.construction.baseSec +
        params.lines.construction.perChangedSegmentSec * 2 +
        0.1,
    );

    expect(simulation.state.lines[0].stationIds).toEqual(['s1', 's2', 's5']);
    expect(simulation.state.lines[0].stationIds[train.currentIndex]).toBe('s2');
    expect(train.direction).toBe(-1);
    expect(simulation.state.lines[0].stationIds[train.nextIndex]).toBe('s1');
  });

  it('removes a line after its demolition construction', () => {
    const simulation = new Simulation(demoMap, 7);
    simulation.createLine(['s1', 's2'], 0);
    runFor(simulation, params.lines.construction.newLineSec + 0.1);

    expect(simulation.deleteLine('L1')).toBe(true);
    expect(simulation.state.lines[0].construction?.kind).toBe('delete');

    runFor(simulation, 10);

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
    expect(simulation.state.trains).toHaveLength(params.trains.initialPerLine);
  });
});
