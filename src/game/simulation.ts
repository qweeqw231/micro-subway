import { demoMap } from './demo-map';
import { params } from './params';
import { createRng, type Rng } from './rng';
import { findRoute, isRouteValid } from './routing';
import type {
  DemoMap,
  HudSnapshot,
  Line,
  Passenger,
  RoutePlan,
  SimState,
  Station,
  StationType,
  Train,
} from './types';

type DestinationPhase = 'offpeak' | 'morning' | 'evening';
type LineEnd = 'start' | 'end';

const DEFAULT_SEED = 20261103;

export class Simulation {
  readonly state: SimState;

  private readonly map: DemoMap;
  private readonly rng: Rng;
  private nextPassengerId = 1;

  constructor(map: DemoMap = demoMap, seed = DEFAULT_SEED) {
    this.map = map;
    this.rng = createRng(seed);

    this.state = {
      tick: 0,
      elapsedSec: 0,
      week: 1,
      dayIndex: 0,
      dayProgress: map.startDayProgress,
      lines: [],
      trains: [],
      stations: map.stations.map((station) => ({
        ...station,
        capacity: params.stations.capacity,
        queue: [],
        overloadSec: 0,
        nextSpawnSec: Number.POSITIVE_INFINITY,
      })),
      stats: {
        delivered: 0,
        spawned: 0,
        lost: 0,
        maxQueue: 0,
      },
      failed: false,
      failureStationId: null,
    };
  }

  createLine(stationIds: string[], colorIndex: number): string | null {
    if (
      colorIndex < 0 ||
      colorIndex >= params.lines.startUnlocked ||
      this.state.lines.some((line) => line.colorIndex === colorIndex)
    ) {
      return null;
    }

    if (
      stationIds.length < params.lines.minStationsPerLine ||
      stationIds.length > params.lines.maxStationsPerLine
    ) {
      return null;
    }

    const unique = [...new Set(stationIds)];
    if (unique.length !== stationIds.length) {
      return null;
    }

    const stations = stationIds.map((id) => this.tryStation(id));
    if (stations.some((station) => station === undefined)) {
      return null;
    }

    const line: Line = {
      id: `L${colorIndex + 1}`,
      colorIndex,
      color: params.lines.colors[colorIndex],
      stationIds: [...stationIds],
      construction: {
        kind: 'create',
        endSec:
          this.state.elapsedSec + params.lines.construction.newLineSec,
        newStationIds: [...stationIds],
      },
    };

    this.state.lines.push(line);
    return line.id;
  }

  appendStation(lineId: string, stationId: string, end: LineEnd = 'end'): boolean {
    const line = this.tryLine(lineId);
    const station = this.tryStation(stationId);
    if (
      !line ||
      line.construction ||
      !station ||
      line.stationIds.includes(stationId) ||
      line.stationIds.length >= params.lines.maxStationsPerLine
    ) {
      return false;
    }

    const newStationIds =
      end === 'start'
        ? [stationId, ...line.stationIds]
        : [...line.stationIds, stationId];

    this.startEdit(line, newStationIds, this.editDuration(1));
    return true;
  }

  removeLastStation(lineId: string): boolean {
    const line = this.tryLine(lineId);
    if (
      !line ||
      line.construction ||
      line.stationIds.length <= params.lines.minStationsPerLine
    ) {
      return false;
    }

    this.startEdit(
      line,
      line.stationIds.slice(0, -1),
      params.lines.construction.baseSec,
    );
    return true;
  }

  removeFirstStation(lineId: string): boolean {
    const line = this.tryLine(lineId);
    if (
      !line ||
      line.construction ||
      line.stationIds.length <= params.lines.minStationsPerLine
    ) {
      return false;
    }

    this.startEdit(
      line,
      line.stationIds.slice(1),
      params.lines.construction.baseSec,
    );
    return true;
  }

  replaceLastStation(lineId: string, stationId: string): boolean {
    const line = this.tryLine(lineId);
    const station = this.tryStation(stationId);
    if (
      !line ||
      line.construction ||
      !station ||
      line.stationIds.includes(stationId) ||
      line.stationIds.length < 2
    ) {
      return false;
    }

    const newStationIds = [...line.stationIds.slice(0, -1), stationId];
    this.startEdit(line, newStationIds, this.editDuration(2));
    return true;
  }

  deleteLine(lineId: string): boolean {
    const line = this.tryLine(lineId);
    if (!line || line.construction) {
      return false;
    }

    line.construction = {
      kind: 'delete',
      endSec: this.state.elapsedSec + params.lines.construction.deleteSec,
      newStationIds: null,
    };
    this.refreshWaitingRoutes();
    return true;
  }

  tick(dt: number): void {
    if (this.state.failed) {
      return;
    }

    this.state.tick += 1;
    this.state.elapsedSec += dt;
    this.refreshClock();
    this.updateConstructions();
    this.updateSpawns();
    this.updateTrains(dt);
    this.updateOverload(dt);
  }

  getHud(): HudSnapshot {
    const failureStation = this.state.failureStationId
      ? this.stationById(this.state.failureStationId)
      : null;

    const totalDays =
      this.map.startDayProgress + this.state.elapsedSec / params.time.daySeconds;
    const dayProgress = totalDays % 1;
    const hours = dayProgress * 24;
    const hour = Math.floor(hours);
    const minute = Math.floor((hours - hour) * 60);
    const clock = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    const totalLineStations = new Set(
      this.state.lines.flatMap((line) =>
        line.construction?.kind === 'create'
          ? line.construction.newStationIds ?? []
          : line.stationIds,
      ),
    ).size;

    return {
      week: this.state.week,
      day: (this.state.dayIndex % 7) + 1,
      clock,
      delivered: this.state.stats.delivered,
      maxQueue: this.state.stats.maxQueue,
      lineCount: this.state.lines.length,
      totalLineStations,
      lineSlots: params.lines.startUnlocked,
      lines: this.state.lines.map((line) => ({
        id: line.id,
        colorIndex: line.colorIndex,
        color: line.color,
        stationCount: line.stationIds.length,
        constructionKind: line.construction?.kind ?? null,
        constructionSec: line.construction
          ? Math.max(0, line.construction.endSec - this.state.elapsedSec)
          : 0,
      })),
      failed: this.state.failed,
      failure: failureStation
        ? {
            stationType: failureStation.type,
            queue: failureStation.queue.length,
            capacity: failureStation.capacity,
            seconds: Math.round(failureStation.overloadSec),
          }
        : null,
    };
  }

  private startEdit(
    line: Line,
    newStationIds: string[],
    duration: number,
  ): void {
    line.construction = {
      kind: 'edit',
      endSec: this.state.elapsedSec + Math.min(params.lines.construction.maxSec, duration),
      newStationIds,
    };
    this.refreshWaitingRoutes();
  }

  private editDuration(changedSegments: number): number {
    return (
      params.lines.construction.baseSec +
      params.lines.construction.perChangedSegmentSec * changedSegments
    );
  }

  private updateConstructions(): void {
    const completed = this.state.lines.filter(
      (line) => line.construction && this.state.elapsedSec >= line.construction.endSec,
    );

    for (const line of completed) {
      const construction = line.construction;
      if (!construction) {
        continue;
      }

      if (construction.kind === 'create') {
        line.construction = null;
        this.createTrain(line);
        for (const stationId of line.stationIds) {
          this.scheduleSpawn(this.stationById(stationId), true);
        }
      }

      if (construction.kind === 'edit') {
        const oldStationIds = [...line.stationIds];
        line.stationIds = construction.newStationIds ?? line.stationIds;
        line.construction = null;
        this.normalizeTrains(line, oldStationIds);
        for (const stationId of line.stationIds) {
          const station = this.stationById(stationId);
          if (!this.isStationActive(stationId)) {
            continue;
          }
          this.scheduleSpawn(station, true);
        }
      }

      if (construction.kind === 'delete') {
        this.removeLine(line);
        continue;
      }

      this.refreshWaitingRoutes();
    }
  }

  private removeLine(line: Line): void {
    const trains = this.state.trains.filter((train) => train.lineId === line.id);

    for (const train of trains) {
      const stationId = line.stationIds[train.currentIndex];
      if (stationId) {
        const station = this.tryStation(stationId);
        if (station) {
          for (const passenger of train.passengers) {
            passenger.route = null;
            passenger.stepIndex = 0;
            station.queue.push(passenger);
          }
        }
      }
    }

    this.state.trains = this.state.trains.filter(
      (train) => train.lineId !== line.id,
    );
    this.state.lines = this.state.lines.filter((entry) => entry.id !== line.id);

    for (const station of this.state.stations) {
      if (!this.isStationActive(station.id)) {
        station.nextSpawnSec = Number.POSITIVE_INFINITY;
      }
    }

    this.refreshWaitingRoutes();
  }

  private createTrain(line: Line): void {
    if (this.state.trains.some((train) => train.lineId === line.id)) {
      return;
    }

    const train: Train = {
      id: `T${line.id}`,
      lineId: line.id,
      currentIndex: 0,
      nextIndex: 1,
      direction: 1,
      progress: 0,
      state: 'dwell',
      dwellSec: params.trains.dwellBaseSec,
      capacity: params.trains.capacity,
      passengers: [],
    };

    this.state.trains.push(train);
    const boarded = this.boardAtStation(train, line);
    train.dwellSec = Math.min(
      params.trains.dwellMaxSec,
      params.trains.dwellBaseSec + boarded * params.trains.dwellPerPassengerSec,
    );
  }

  private normalizeTrains(line: Line, oldStationIds: string[]): void {
    for (const train of this.state.trains) {
      if (train.lineId !== line.id) {
        continue;
      }

      const oldIndex = train.currentIndex;
      const oldCurrentId = oldStationIds[train.currentIndex];
      let nextIndex = oldCurrentId
        ? line.stationIds.indexOf(oldCurrentId)
        : -1;

      if (nextIndex === -1) {
        const oldStation = oldCurrentId ? this.tryStation(oldCurrentId) : undefined;
        nextIndex = oldStation
          ? this.nearestStationIndex(line, oldStation)
          : 0;
      }

      train.currentIndex = Math.max(0, nextIndex);
      train.progress = 0;
      train.state = 'dwell';
      train.dwellSec = params.trains.dwellBaseSec;

      if (
        oldIndex === oldStationIds.length - 1 &&
        train.currentIndex < line.stationIds.length - 1 &&
        train.direction === -1
      ) {
        train.direction = 1;
      } else if (
        oldIndex === 0 &&
        train.currentIndex > 0 &&
        train.direction === 1
      ) {
        train.direction = -1;
      } else if (train.currentIndex <= 0) {
        train.direction = 1;
      } else if (train.currentIndex >= line.stationIds.length - 1) {
        train.direction = -1;
      }

      let candidate = train.currentIndex + train.direction;
      if (candidate < 0 || candidate >= line.stationIds.length) {
        train.direction = train.direction === 1 ? -1 : 1;
        candidate = train.currentIndex + train.direction;
      }
      train.nextIndex = candidate;
    }
  }

  private nearestStationIndex(line: Line, station: Station): number {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    line.stationIds.forEach((stationId, index) => {
      const candidate = this.tryStation(stationId);
      if (!candidate) {
        return;
      }
      const distance = Math.hypot(
        candidate.x - station.x,
        candidate.y - station.y,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    return bestIndex;
  }

  private updateSpawns(): void {
    for (const station of this.state.stations) {
      if (!this.isStationActive(station.id)) {
        station.nextSpawnSec = Number.POSITIVE_INFINITY;
        continue;
      }

      if (!Number.isFinite(station.nextSpawnSec)) {
        this.scheduleSpawn(station, true);
        continue;
      }

      if (this.state.elapsedSec >= station.nextSpawnSec) {
        this.spawnPassenger(station);
        this.scheduleSpawn(station, false);
      }
    }
  }

  private spawnPassenger(station: Station): void {
    const destination = this.chooseDestination(station);
    if (!destination) {
      return;
    }

    const hardCap = station.capacity * params.demand.queueHardCapFactor;
    if (station.queue.length >= hardCap) {
      this.state.stats.lost += 1;
      return;
    }

    const lastStep = destination.route.steps[destination.route.steps.length - 1];
    const passenger: Passenger = {
      id: this.nextPassengerId,
      destType: destination.type,
      targetStationId: lastStep.toStationId,
      spawnedAtSec: this.state.elapsedSec,
      route: destination.route,
      stepIndex: 0,
    };
    this.nextPassengerId += 1;

    station.queue.push(passenger);
    this.state.stats.spawned += 1;
    this.state.stats.maxQueue = Math.max(
      this.state.stats.maxQueue,
      station.queue.length,
    );
  }

  private chooseDestination(
    station: Station,
  ): { type: StationType; route: RoutePlan } | null {
    const phaseWeights =
      params.demand.destinationWeights[this.getDestinationPhase()];
    const types = [
      ...new Set(this.state.stations.map((entry) => entry.type)),
    ].filter((type) => type !== station.type);
    const choices = types
      .map((type) => ({ type, weight: phaseWeights[type] }))
      .filter((choice) => choice.weight > 0);

    while (choices.length > 0) {
      const total = choices.reduce((sum, choice) => sum + choice.weight, 0);
      let roll = this.rng() * total;
      let pickedIndex = choices.length - 1;

      for (let index = 0; index < choices.length; index += 1) {
        roll -= choices[index].weight;
        if (roll <= 0) {
          pickedIndex = index;
          break;
        }
      }

      const picked = choices[pickedIndex];
      choices.splice(pickedIndex, 1);

      const route = findRoute(this.state, station.id, picked.type);
      if (route) {
        return { type: picked.type, route };
      }
    }

    return null;
  }

  private refreshWaitingRoutes(): void {
    for (const station of this.state.stations) {
      for (const passenger of station.queue) {
        const oldRoute = passenger.route;
        const oldValid =
          oldRoute !== null &&
          isRouteValid(this.state, oldRoute, station.id, passenger.stepIndex);
        const nextRoute = findRoute(this.state, station.id, passenger.destType);

        if (oldValid && oldRoute) {
          const shouldSwitch =
            passenger.stepIndex === 0 &&
            nextRoute !== null &&
            nextRoute.cost <
              oldRoute.cost *
                (1 - params.routing.rerouteImprovementRatio);
          if (shouldSwitch && nextRoute) {
            this.assignRoute(passenger, nextRoute);
          }
          continue;
        }

        if (nextRoute) {
          this.assignRoute(passenger, nextRoute);
        } else {
          passenger.route = null;
          passenger.stepIndex = 0;
        }
      }
    }
  }

  private assignRoute(passenger: Passenger, route: RoutePlan): void {
    passenger.route = route;
    passenger.stepIndex = 0;
    passenger.targetStationId = route.steps[route.steps.length - 1].toStationId;
  }

  private ensurePassengerRoute(passenger: Passenger, stationId: string): boolean {
    if (
      passenger.route &&
      isRouteValid(
        this.state,
        passenger.route,
        stationId,
        passenger.stepIndex,
      )
    ) {
      return true;
    }

    const route = findRoute(this.state, stationId, passenger.destType);
    if (!route) {
      passenger.route = null;
      passenger.stepIndex = 0;
      return false;
    }

    this.assignRoute(passenger, route);
    return true;
  }

  private updateTrains(dt: number): void {
    for (const train of this.state.trains) {
      const line = this.tryLine(train.lineId);
      if (!line || line.stationIds.length < 2) {
        continue;
      }

      if (train.state === 'dwell') {
        train.dwellSec -= dt;
        if (train.dwellSec <= 0) {
          train.state = 'moving';
          train.progress = 0;
        }
        continue;
      }

      const from = this.stationById(line.stationIds[train.currentIndex]);
      const to = this.stationById(line.stationIds[train.nextIndex]);
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const duration = Math.max(
        0.1,
        distance / params.trains.speedPxPerSec + params.trains.accelPenaltySec,
      );

      train.progress += dt / duration;
      if (train.progress >= 1) {
        train.currentIndex = train.nextIndex;
        train.progress = 0;
        this.arriveAtStation(train, line);
      }
    }
  }

  private arriveAtStation(train: Train, line: Line): void {
    const currentId = line.stationIds[train.currentIndex];
    this.setNextDirection(train, line);

    const delivered = this.processOnboard(train, line, currentId);
    const boarded = this.boardAtStation(train, line);
    train.dwellSec = Math.min(
      params.trains.dwellMaxSec,
      params.trains.dwellBaseSec +
        params.trains.dwellPerPassengerSec * (boarded + delivered),
    );
    train.state = 'dwell';
  }

  private processOnboard(
    train: Train,
    line: Line,
    currentId: string,
  ): number {
    const station = this.stationById(currentId);
    const staying: Passenger[] = [];
    let delivered = 0;

    for (const passenger of train.passengers) {
      const route = passenger.route;
      const step = route?.steps[passenger.stepIndex];

      if (!route || !step || step.toStationId !== currentId) {
        passenger.route = null;
        passenger.stepIndex = 0;
        station.queue.push(passenger);
        continue;
      }

      passenger.stepIndex += 1;
      if (passenger.stepIndex >= route.steps.length) {
        delivered += 1;
        continue;
      }

      if (
        !isRouteValid(
          this.state,
          route,
          currentId,
          passenger.stepIndex,
          line.construction ? line.id : undefined,
        )
      ) {
        passenger.route = null;
        passenger.stepIndex = 0;
        station.queue.push(passenger);
        continue;
      }

      const nextStep = route.steps[passenger.stepIndex];
      const nextStationId = line.stationIds[train.nextIndex];
      const staysOnboard =
        nextStep.fromStationId === currentId &&
        nextStep.lineId === line.id &&
        nextStep.dir === train.direction &&
        nextStep.toStationId === nextStationId;

      if (staysOnboard) {
        staying.push(passenger);
      } else {
        station.queue.push(passenger);
      }
    }

    train.passengers = staying;
    this.state.stats.delivered += delivered;
    return delivered;
  }

  private boardAtStation(train: Train, line: Line): number {
    if (line.construction) {
      return 0;
    }

    const lineId = line.id;
    const currentId = line.stationIds[train.currentIndex];
    const nextStationId = line.stationIds[train.nextIndex];
    const station = this.stationById(currentId);
    let boarded = 0;
    let index = 0;

    while (
      index < station.queue.length &&
      train.passengers.length < train.capacity
    ) {
      const passenger = station.queue[index];
      if (!this.ensurePassengerRoute(passenger, currentId)) {
        index += 1;
        continue;
      }

      const step = passenger.route?.steps[passenger.stepIndex];
      const canBoard =
        step !== undefined &&
        step.fromStationId === currentId &&
        step.lineId === lineId &&
        step.dir === train.direction &&
        step.toStationId === nextStationId;

      if (!canBoard) {
        index += 1;
        continue;
      }

      station.queue.splice(index, 1);
      train.passengers.push(passenger);
      boarded += 1;
    }

    return boarded;
  }

  private setNextDirection(train: Train, line: Line): void {
    const lastIndex = line.stationIds.length - 1;

    if (train.currentIndex <= 0) {
      train.direction = 1;
    } else if (train.currentIndex >= lastIndex) {
      train.direction = -1;
    }

    let nextIndex = train.currentIndex + train.direction;
    if (nextIndex < 0 || nextIndex > lastIndex) {
      train.direction = train.direction === 1 ? -1 : 1;
      nextIndex = train.currentIndex + train.direction;
    }

    train.nextIndex = nextIndex;
  }

  private updateOverload(dt: number): void {
    for (const station of this.state.stations) {
      if (station.queue.length > station.capacity) {
        station.overloadSec += dt;
        if (
          !this.state.failed &&
          station.overloadSec >= this.map.overloadGraceSec
        ) {
          this.state.failed = true;
          this.state.failureStationId = station.id;
        }
      } else {
        station.overloadSec = Math.max(
          0,
          station.overloadSec - dt * params.stations.overloadDecayRate,
        );
      }

      this.state.stats.maxQueue = Math.max(
        this.state.stats.maxQueue,
        station.queue.length,
      );
    }
  }

  private scheduleSpawn(station: Station, initialDelay: boolean): void {
    if (initialDelay && Number.isFinite(station.nextSpawnSec)) {
      return;
    }

    const rate = this.getSpawnRate(station);
    const delay = initialDelay ? params.demand.firstLineSpawnDelaySec : 0;
    station.nextSpawnSec = this.state.elapsedSec + delay + this.randomDelay(rate);
  }

  private randomDelay(rate: number): number {
    const safeRate = Math.max(rate, 0.000001);
    const random = Math.max(this.rng(), 0.000001);
    return -Math.log(1 - random) / safeRate;
  }

  private getSpawnRate(station: Station): number {
    const weekly = Math.pow(params.demand.weeklyGrowth, this.state.week - 1);
    const phase = this.getPhaseMultiplier();
    const origin = params.demand.originWeights[station.type];

    return (
      params.demand.baseRatePerStation *
      this.map.demandScale *
      weekly *
      phase *
      origin
    );
  }

  private getPhaseMultiplier(): number {
    const hour = this.state.dayProgress * 24;
    const phase = params.demand.dayPhases.find(
      (entry) => hour >= entry.fromHour && hour < entry.toHour,
    );
    return phase ? phase.multiplier : 1;
  }

  private getDestinationPhase(): DestinationPhase {
    const hour = this.state.dayProgress * 24;
    const phase = params.demand.dayPhases.find(
      (entry) => hour >= entry.fromHour && hour < entry.toHour,
    );

    if (
      phase?.destinationPhase === 'morning' ||
      phase?.destinationPhase === 'evening'
    ) {
      return phase.destinationPhase;
    }
    return 'offpeak';
  }

  private refreshClock(): void {
    const daySeconds = params.time.daySeconds;
    const weekDays = params.time.weekDays;
    const totalDays =
      this.map.startDayProgress + this.state.elapsedSec / daySeconds;

    this.state.week =
      1 + Math.floor(this.state.elapsedSec / (daySeconds * weekDays));
    this.state.dayIndex = Math.floor(totalDays) % 7;
    this.state.dayProgress = totalDays % 1;
  }

  private isStationActive(stationId: string): boolean {
    return this.state.lines.some(
      (line) => line.construction === null && line.stationIds.includes(stationId),
    );
  }

  private tryStation(id: string): Station | undefined {
    return this.state.stations.find((station) => station.id === id);
  }

  private stationById(id: string): Station {
    const station = this.tryStation(id);
    if (!station) {
      throw new Error(`Unknown station: ${id}`);
    }
    return station;
  }

  private tryLine(id: string): Line | undefined {
    return this.state.lines.find((line) => line.id === id);
  }
}
