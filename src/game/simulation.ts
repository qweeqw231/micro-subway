import { demoMap } from './demo-map';
import { countWaterCrossings } from './map-utils';
import { params } from './params';
import { createRng, type Rng } from './rng';
import {
  estimateRemainingCost,
  findRoute,
  isRouteValid,
} from './routing';
import type {
  GameMap,
  HudSnapshot,
  Line,
  Passenger,
  RoutePlan,
  SimSnapshot,
  SimState,
  Station,
  StationType,
  Train,
  UpgradeCard,
  UpgradeKind,
} from './types';

type DestinationPhase = 'offpeak' | 'morning' | 'evening';
type LineEnd = 'start' | 'end';

const DEFAULT_SEED = 20261103;

export class Simulation {
  readonly state: SimState;
  readonly map: GameMap;
  readonly seed: number;
  lastActionError: 'bridge' | null = null;

  private readonly rng: Rng;
  private readonly routeCache = new Map<string, RoutePlan | null>();
  private lastRouteRefreshSec = 0;
  private nextPassengerId = 1;

  constructor(map: GameMap = demoMap, seed = DEFAULT_SEED) {
    this.map = map;
    this.seed = seed;
    this.rng = createRng(seed);
    const mapTuning = (
      params.maps as Record<string, { initialBridgeTokens?: number }>
    )[map.id];

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
        active: station.appearWeek <= 1,
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
      unlockedLineSlots: params.lines.startUnlocked,
      bridgeCapacity: mapTuning?.initialBridgeTokens ?? 0,
      graceBonusSec: 0,
      graceStacks: 0,
      weekly: null,
      weekStartDelivered: 0,
      weekMaxQueue: 0,
    };
  }

  createLine(stationIds: string[], colorIndex: number): string | null {
    if (
      colorIndex < 0 ||
      colorIndex >= this.state.unlockedLineSlots ||
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
    if (stations.some((station) => !station || !station.active)) {
      return null;
    }

    if (!this.canUseBridges(null, stationIds)) {
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
      removing: false,
      carriageLevel: 0,
      speedStacks: 0,
    };

    this.lastActionError = null;
    this.state.lines.push(line);
    return line.id;
  }

  exportSnapshot(): SimSnapshot {
    return {
      seed: this.seed,
      rngState: this.rng.getState(),
      nextPassengerId: this.nextPassengerId,
      lastRouteRefreshSec: this.lastRouteRefreshSec,
      state: this.state,
    };
  }

  static fromSnapshot(map: GameMap, snapshot: SimSnapshot): Simulation {
    const simulation = new Simulation(map, snapshot.seed);
    simulation.rng.setState(snapshot.rngState);
    simulation.nextPassengerId = snapshot.nextPassengerId;
    simulation.lastRouteRefreshSec = snapshot.lastRouteRefreshSec;
    Object.assign(simulation.state, snapshot.state);
    simulation.routeCache.clear();
    return simulation;
  }

  private effectiveStationIds(line: Line): string[] {
    return line.construction?.newStationIds ?? line.stationIds;
  }

  private usedBridges(excludeLineId: string | null, extraIds: string[] = []): number {
    let used = extraIds.length > 0 ? countWaterCrossings(extraIds, this.map) : 0;

    for (const line of this.state.lines) {
      if (line.id === excludeLineId) {
        continue;
      }
      used += countWaterCrossings(this.effectiveStationIds(line), this.map);
    }

    return used;
  }

  previewBridges(
    excludeLineId: string | null,
    stationIds: string[],
  ): { crossings: number; used: number; capacity: number; allowed: boolean } {
    const crossings = countWaterCrossings(stationIds, this.map);
    const used = this.usedBridges(excludeLineId, stationIds);
    return {
      crossings,
      used,
      capacity: this.state.bridgeCapacity,
      allowed: used <= this.state.bridgeCapacity,
    };
  }

  private canUseBridges(
    excludeLineId: string | null,
    stationIds: string[],
  ): boolean {
    const used = this.usedBridges(excludeLineId, stationIds);
    if (used > this.state.bridgeCapacity) {
      this.lastActionError = 'bridge';
      return false;
    }

    this.lastActionError = null;
    return true;
  }

  private getRoute(stationId: string, destType: StationType): RoutePlan | null {
    const key = `${stationId}|${destType}`;
    if (this.routeCache.has(key)) {
      return this.routeCache.get(key) ?? null;
    }

    const route = findRoute(this.state, stationId, destType);
    this.routeCache.set(key, route);
    return route;
  }

  private handleNetworkChange(): void {
    this.routeCache.clear();
    this.refreshWaitingRoutes();
    for (const train of this.state.trains) {
      for (const passenger of train.passengers) {
        passenger.rerouteCheck = true;
      }
    }
    this.lastRouteRefreshSec = this.state.elapsedSec;
  }

  appendStation(lineId: string, stationId: string, end: LineEnd = 'end'): boolean {
    const line = this.tryLine(lineId);
    const station = this.tryStation(stationId);
    if (
      !line ||
      line.construction ||
      line.removing ||
      !station ||
      !station.active ||
      line.stationIds.includes(stationId) ||
      line.stationIds.length >= params.lines.maxStationsPerLine
    ) {
      return false;
    }

    const newStationIds =
      end === 'start'
        ? [stationId, ...line.stationIds]
        : [...line.stationIds, stationId];

    if (!this.canUseBridges(line.id, newStationIds)) {
      return false;
    }

    this.startEdit(line, newStationIds, this.editDuration(1));
    return true;
  }

  removeLastStation(lineId: string): boolean {
    const line = this.tryLine(lineId);
    if (
      !line ||
      line.construction ||
      line.removing ||
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
      line.removing ||
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
      line.removing ||
      !station ||
      !station.active ||
      line.stationIds.includes(stationId) ||
      line.stationIds.length < 2
    ) {
      return false;
    }

    const newStationIds = [...line.stationIds.slice(0, -1), stationId];
    if (!this.canUseBridges(line.id, newStationIds)) {
      return false;
    }
    this.startEdit(line, newStationIds, this.editDuration(2));
    return true;
  }

  replaceFirstStation(lineId: string, stationId: string): boolean {
    const line = this.tryLine(lineId);
    const station = this.tryStation(stationId);
    if (
      !line ||
      line.construction ||
      line.removing ||
      !station ||
      !station.active ||
      line.stationIds.includes(stationId) ||
      line.stationIds.length < 2
    ) {
      return false;
    }

    const newStationIds = [stationId, ...line.stationIds.slice(1)];
    if (!this.canUseBridges(line.id, newStationIds)) {
      return false;
    }
    this.startEdit(line, newStationIds, this.editDuration(2));
    return true;
  }

  deleteLine(lineId: string): boolean {
    const line = this.tryLine(lineId);
    if (!line || line.construction || line.removing) {
      return false;
    }

    line.construction = {
      kind: 'delete',
      endSec: this.state.elapsedSec + params.lines.construction.deleteSec,
      newStationIds: null,
    };
    this.handleNetworkChange();
    return true;
  }

  tick(dt: number): void {
    if (this.state.failed || this.state.weekly) {
      return;
    }

    const previousWeek = this.state.week;
    this.state.tick += 1;
    this.state.elapsedSec += dt;
    this.refreshClock();

    if (this.state.week > previousWeek) {
      this.startWeekly(previousWeek);
      return;
    }

    this.updateConstructions();
    if (
      this.state.elapsedSec - this.lastRouteRefreshSec >=
      params.routing.recomputeIntervalSec
    ) {
      this.handleNetworkChange();
    }
    this.updateSpawns();
    this.updateTrains(dt);
    this.updateOverload(dt);
  }

  advanceWeeklyToCards(): void {
    if (this.state.weekly?.phase === 'summary') {
      this.state.weekly.phase = 'cards';
    }
  }

  chooseUpgrade(cardId: string): void {
    const weekly = this.state.weekly;
    if (!weekly || weekly.phase !== 'cards') {
      return;
    }

    const card = weekly.cards.find((entry) => entry.id === cardId);
    if (!card) {
      return;
    }

    const targetKind = this.upgradeTargetKind(card.kind);
    if (targetKind) {
      weekly.phase = 'target';
      weekly.selectedCard = card;
      weekly.targetKind = targetKind;
      weekly.defaultTargetIds = this.autoTargetIds(card.kind);
      return;
    }

    this.applyUpgrade(card.kind, []);
    this.finishWeekly();
  }

  confirmUpgradeTarget(targetIds: string[]): void {
    const weekly = this.state.weekly;
    if (
      !weekly ||
      weekly.phase !== 'target' ||
      !weekly.selectedCard ||
      !weekly.targetKind
    ) {
      return;
    }

    const kind = weekly.selectedCard.kind;
    const validIds =
      weekly.targetKind === 'line'
        ? targetIds.slice(0, 1)
        : targetIds.slice(0, params.stations.stationsPerExpansion);

    this.applyUpgrade(
      kind,
      validIds.length > 0 ? validIds : weekly.defaultTargetIds,
    );
    this.finishWeekly();
  }

  private finishWeekly(): void {
    this.state.weekly = null;
    this.state.weekStartDelivered = this.state.stats.delivered;
    this.state.weekMaxQueue = 0;
    this.activateStationsForWeek();
    if (
      this.state.week >= params.lines.thirdUnlockWeek &&
      this.state.unlockedLineSlots < 3
    ) {
      this.state.unlockedLineSlots = 3;
    }
    this.handleNetworkChange();
  }

  private upgradeTargetKind(
    kind: UpgradeKind,
  ): 'line' | 'stations' | null {
    if (kind === 'train' || kind === 'carriage' || kind === 'speed') {
      return 'line';
    }
    if (kind === 'stationExpansion') {
      return 'stations';
    }
    return null;
  }

  private startWeekly(completedWeek: number): void {
    const summary = {
      completedWeek,
      delivered: this.state.stats.delivered - this.state.weekStartDelivered,
      maxQueue: this.state.weekMaxQueue,
      newStations: this.map.stations.filter(
        (station) => station.appearWeek === this.state.week,
      ).length,
    };
    const special = (
      params.upgrades.specialWeeks as number[]
    ).includes(completedWeek);
    const count = special
      ? params.upgrades.specialCardsPerWeek
      : params.upgrades.cardsPerWeek;

    this.state.weekly = {
      phase: 'summary',
      summary,
      cards: this.drawUpgradeCards(count),
      selectedCard: null,
      targetKind: null,
      defaultTargetIds: [],
    };
  }

  private drawUpgradeCards(count: number): UpgradeCard[] {
    const candidates = this.availableUpgradeKinds();
    const cards: UpgradeCard[] = [];

    while (cards.length < count && candidates.length > 0) {
      const total = candidates.reduce((sum, entry) => sum + entry.weight, 0);
      let roll = this.rng() * total;
      let selectedIndex = candidates.length - 1;

      for (let index = 0; index < candidates.length; index += 1) {
        roll -= candidates[index].weight;
        if (roll <= 0) {
          selectedIndex = index;
          break;
        }
      }

      const selected = candidates.splice(selectedIndex, 1)[0];
      cards.push({ id: `card-${selected.kind}`, kind: selected.kind });
    }

    return cards;
  }

  private availableUpgradeKinds(): Array<{ kind: UpgradeKind; weight: number }> {
    const weights = params.upgrades.weights;
    const caps = params.upgrades.caps;
    const lines = this.state.lines.filter((line) => !line.removing);
    const activeStations = this.state.stations.filter((station) => station.active);
    const result: Array<{ kind: UpgradeKind; weight: number }> = [];

    if (
      lines.some(
        (line) =>
          this.state.trains.filter((train) => train.lineId === line.id).length <
          caps.newTrainMaxPerLine,
      )
    ) {
      result.push({ kind: 'train', weight: weights.newTrain });
    }
    if (lines.some((line) => line.carriageLevel < caps.carriageMaxPerLine)) {
      result.push({ kind: 'carriage', weight: weights.carriage });
    }
    if (this.state.unlockedLineSlots < params.lines.max) {
      result.push({ kind: 'lineSlot', weight: weights.newLine });
    }
    if (this.state.bridgeCapacity < caps.bridgeMax) {
      result.push({ kind: 'bridge', weight: weights.bridge });
    }
    if (
      activeStations.some((station) => station.capacity < caps.stationCapacityMax)
    ) {
      result.push({ kind: 'stationExpansion', weight: weights.stationExpansion });
    }
    if (lines.some((line) => line.speedStacks < caps.speedMaxStacks)) {
      result.push({ kind: 'speed', weight: weights.speed });
    }
    if (this.state.graceStacks < caps.graceMaxStacks) {
      result.push({ kind: 'grace', weight: weights.grace });
    }

    return result;
  }

  private applyUpgrade(kind: UpgradeKind, targetIds: string[]): void {
    if (kind === 'train') {
      const line = this.resolveTargetLine(kind, targetIds);
      if (line) {
        this.addTrainToLine(line);
      }
    }

    if (kind === 'carriage') {
      const line = this.resolveTargetLine(kind, targetIds);
      if (line && line.carriageLevel < params.upgrades.caps.carriageMaxPerLine) {
        line.carriageLevel += 1;
        for (const train of this.state.trains) {
          if (train.lineId === line.id) {
            train.capacity += params.trains.carriageCapacity;
          }
        }
      }
    }

    if (kind === 'lineSlot') {
      this.state.unlockedLineSlots = Math.min(
        params.lines.max,
        this.state.unlockedLineSlots + 1,
      );
    }

    if (kind === 'bridge') {
      this.state.bridgeCapacity = Math.min(
        params.upgrades.caps.bridgeMax,
        this.state.bridgeCapacity + 1,
      );
    }

    if (kind === 'stationExpansion') {
      const targetStations = targetIds
        .map((id) => this.tryStation(id))
        .filter(
          (station): station is Station =>
            station !== undefined && station.active,
        );
      const stations =
        targetStations.length > 0
          ? targetStations.slice(0, params.stations.stationsPerExpansion)
          : this.autoTargetIds(kind)
              .map((id) => this.tryStation(id))
              .filter((station): station is Station => station !== undefined);
      for (const station of stations) {
        station.capacity = Math.min(
          params.upgrades.caps.stationCapacityMax,
          station.capacity + params.stations.capacityPerExpansion,
        );
      }
    }

    if (kind === 'speed') {
      const line = this.resolveTargetLine(kind, targetIds);
      if (line && line.speedStacks < params.upgrades.caps.speedMaxStacks) {
        line.speedStacks += 1;
      }
    }

    if (kind === 'grace') {
      this.state.graceStacks = Math.min(
        params.upgrades.caps.graceMaxStacks,
        this.state.graceStacks + 1,
      );
      this.state.graceBonusSec =
        this.state.graceStacks * params.stations.graceUpgradeSec;
    }
  }

  private autoTargetIds(kind: UpgradeKind): string[] {
    if (kind === 'stationExpansion') {
      return this.state.stations
        .filter((station) => station.active)
        .sort((a, b) => b.queue.length - a.queue.length)
        .slice(0, params.stations.stationsPerExpansion)
        .map((station) => station.id);
    }

    if (kind === 'train' || kind === 'carriage' || kind === 'speed') {
      const line = this.resolveTargetLine(kind, []);
      return line ? [line.id] : [];
    }

    return [];
  }

  private resolveTargetLine(
    kind: UpgradeKind,
    targetIds: string[],
  ): Line | undefined {
    const requested = targetIds[0] ? this.tryLine(targetIds[0]) : undefined;
    if (requested && !requested.removing) {
      return requested;
    }

    const lines = this.state.lines.filter(
      (line) => !line.removing && line.stationIds.length >= 2,
    );
    if (lines.length === 0) {
      return undefined;
    }

    if (kind === 'train') {
      return [...lines].sort(
        (a, b) =>
          this.state.trains.filter((train) => train.lineId === a.id).length -
          this.state.trains.filter((train) => train.lineId === b.id).length,
      )[0];
    }
    if (kind === 'carriage') {
      return [...lines].sort(
        (a, b) => a.carriageLevel - b.carriageLevel,
      )[0];
    }
    if (kind === 'speed') {
      return [...lines].sort(
        (a, b) => b.stationIds.length - a.stationIds.length,
      )[0];
    }

    return lines[0];
  }

  private activateStationsForWeek(): void {
    for (const station of this.state.stations) {
      if (station.appearWeek <= this.state.week) {
        station.active = true;
      }
    }
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
      mapId: this.map.id,
      mapNameKey: this.map.nameKey,
      week: this.state.week,
      day: (this.state.dayIndex % 7) + 1,
      clock,
      delivered: this.state.stats.delivered,
      maxQueue: this.state.stats.maxQueue,
      lineCount: this.state.lines.length,
      totalLineStations,
      lineSlots: this.state.unlockedLineSlots,
      bridgesUsed: this.usedBridges(null),
      bridgeCapacity: this.state.bridgeCapacity,
      lines: this.state.lines.map((line) => ({
        id: line.id,
        colorIndex: line.colorIndex,
        color: line.color,
        stationCount: line.stationIds.length,
        constructionKind: line.construction?.kind ?? null,
        constructionSec: line.construction
          ? Math.max(0, line.construction.endSec - this.state.elapsedSec)
          : 0,
        removing: line.removing,
        trainCount: this.state.trains.filter(
          (train) => train.lineId === line.id,
        ).length,
        carriageLevel: line.carriageLevel,
        speedStacks: line.speedStacks,
      })),
      stations: this.state.stations.map((station) => ({
        id: station.id,
        type: station.type,
        active: station.active,
        queue: station.queue.length,
        capacity: station.capacity,
      })),
      weekly: this.state.weekly,
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
    this.handleNetworkChange();
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
        line.construction = null;
        line.removing = true;
        if (
          !this.state.trains.some((train) => train.lineId === line.id)
        ) {
          this.finishLineRemoval(line);
        } else {
          this.handleNetworkChange();
        }
        continue;
      }

      this.handleNetworkChange();
    }
  }

  private finishLineRemoval(line: Line): void {
    this.state.trains = this.state.trains.filter(
      (train) => train.lineId !== line.id,
    );
    this.state.lines = this.state.lines.filter((entry) => entry.id !== line.id);

    for (const station of this.state.stations) {
      if (!this.isStationActive(station.id)) {
        station.nextSpawnSec = Number.POSITIVE_INFINITY;
      }
    }

    this.handleNetworkChange();
  }

  private createTrain(line: Line): void {
    this.addTrainToLine(line);
  }

  private addTrainToLine(line: Line): boolean {
    const existing = this.state.trains.filter(
      (train) => train.lineId === line.id,
    );
    if (
      existing.length >= params.trains.maxTrainsPerLine ||
      line.stationIds.length < 2
    ) {
      return false;
    }

    const startIndex = existing.length === 0 ? 0 : line.stationIds.length - 1;
    const direction: 1 | -1 = startIndex === 0 ? 1 : -1;
    const nextIndex = startIndex + direction;
    const train: Train = {
      id: `T${line.id}-${existing.length + 1}`,
      lineId: line.id,
      currentIndex: startIndex,
      nextIndex,
      direction,
      progress: 0,
      state: 'dwell',
      dwellSec: params.trains.dwellBaseSec,
      capacity:
        params.trains.capacity +
        line.carriageLevel * params.trains.carriageCapacity,
      passengers: [],
    };

    this.state.trains.push(train);
    const boarded = this.boardAtStation(train, line);
    train.dwellSec = Math.min(
      params.trains.dwellMaxSec,
      params.trains.dwellBaseSec + boarded * params.trains.dwellPerPassengerSec,
    );
    return true;
  }

  private normalizeTrains(line: Line, oldStationIds: string[]): void {
    for (const train of this.state.trains) {
      if (train.lineId !== line.id) {
        continue;
      }

      const oldIndex = train.currentIndex;
      const oldDirection = train.direction;
      const oldCurrentId = oldStationIds[oldIndex];
      let nextIndex = oldCurrentId
        ? line.stationIds.indexOf(oldCurrentId)
        : -1;
      let nextDirection = oldDirection;

      if (nextIndex === -1) {
        nextIndex = this.findStationAhead(
          line,
          oldStationIds,
          oldIndex,
          oldDirection,
        );
        if (nextIndex === -1) {
          nextDirection = oldDirection === 1 ? -1 : 1;
          nextIndex = this.findStationAhead(
            line,
            oldStationIds,
            oldIndex,
            nextDirection,
          );
        }
        if (nextIndex === -1) {
          nextIndex = 0;
        }
      }

      train.currentIndex = Math.max(0, nextIndex);
      train.direction = nextDirection;
      train.progress = 0;
      train.state = 'dwell';
      train.dwellSec = params.trains.dwellBaseSec;

      if (train.currentIndex <= 0) {
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

  private findStationAhead(
    line: Line,
    oldStationIds: string[],
    oldIndex: number,
    direction: 1 | -1,
  ): number {
    for (let offset = 1; offset < oldStationIds.length; offset += 1) {
      const candidateId = oldStationIds[oldIndex + direction * offset];
      if (candidateId === undefined) {
        break;
      }

      const newIndex = line.stationIds.indexOf(candidateId);
      if (newIndex !== -1) {
        return newIndex;
      }
    }

    return -1;
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
      rerouteCheck: false,
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

      const route = this.getRoute(station.id, picked.type);
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
        const nextRoute = this.getRoute(station.id, passenger.destType);
        const oldRemaining =
          oldValid && oldRoute
            ? estimateRemainingCost(
                this.state,
                oldRoute,
                station.id,
                passenger.stepIndex,
                true,
              )
            : Number.POSITIVE_INFINITY;

        const shouldSwitch =
          nextRoute !== null &&
          (!oldValid ||
            nextRoute.cost <
              oldRemaining * (1 - params.routing.rerouteImprovementRatio));

        if (shouldSwitch && nextRoute) {
          this.assignRoute(passenger, nextRoute);
        } else if (!oldValid) {
          passenger.route = null;
          passenger.stepIndex = 0;
          passenger.rerouteCheck = false;
        } else {
          passenger.rerouteCheck = false;
        }
      }
    }
  }

  private assignRoute(passenger: Passenger, route: RoutePlan): void {
    passenger.route = route;
    passenger.stepIndex = 0;
    passenger.rerouteCheck = false;
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

    const route = this.getRoute(stationId, passenger.destType);
    if (!route) {
      passenger.route = null;
      passenger.stepIndex = 0;
      return false;
    }

    this.assignRoute(passenger, route);
    return true;
  }

  private updateTrains(dt: number): void {
    for (const train of [...this.state.trains]) {
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
        distance /
          (params.trains.speedPxPerSec *
            Math.pow(params.trains.speedUpgradeFactor, line.speedStacks)) +
          params.trains.accelPenaltySec,
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

    if (line.removing) {
      const station = this.stationById(currentId);
      for (const passenger of train.passengers) {
        passenger.route = null;
        passenger.stepIndex = 0;
        passenger.rerouteCheck = false;
        station.queue.push(passenger);
      }
      train.passengers = [];
      this.state.trains = this.state.trains.filter(
        (entry) => entry.id !== train.id,
      );
      if (
        !this.state.trains.some(
          (entry) => entry.lineId === line.id,
        )
      ) {
        this.finishLineRemoval(line);
      }
      return;
    }

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
        passenger.rerouteCheck = false;
        station.queue.push(passenger);
        continue;
      }

      passenger.stepIndex += 1;
      if (passenger.stepIndex >= route.steps.length) {
        passenger.rerouteCheck = false;
        delivered += 1;
        continue;
      }

      if (passenger.rerouteCheck) {
        passenger.rerouteCheck = false;
        const allowLineId = line.construction ? line.id : undefined;
        const newRoute = this.getRoute(currentId, passenger.destType);
        const oldRouteValid = isRouteValid(
          this.state,
          route,
          currentId,
          passenger.stepIndex,
          allowLineId,
        );
        const oldRemaining = oldRouteValid
          ? estimateRemainingCost(
              this.state,
              route,
              currentId,
              passenger.stepIndex,
              false,
              allowLineId,
            )
          : Number.POSITIVE_INFINITY;

        if (
          newRoute &&
          (!oldRouteValid ||
            newRoute.cost <
              oldRemaining * (1 - params.routing.rerouteImprovementRatio))
        ) {
          this.assignRoute(passenger, newRoute);
        }
      }

      const activeRoute = passenger.route;
      if (
        !activeRoute ||
        !isRouteValid(
          this.state,
          activeRoute,
          currentId,
          passenger.stepIndex,
          line.construction ? line.id : undefined,
        )
      ) {
        passenger.route = null;
        passenger.stepIndex = 0;
        passenger.rerouteCheck = false;
        station.queue.push(passenger);
        continue;
      }

      const nextStep = activeRoute.steps[passenger.stepIndex];
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
    if (line.construction || line.removing) {
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
          station.overloadSec >=
            this.map.overloadGraceSec + this.state.graceBonusSec
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
      this.state.weekMaxQueue = Math.max(
        this.state.weekMaxQueue,
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
    const station = this.tryStation(stationId);
    if (!station || !station.active) {
      return false;
    }

    return this.state.lines.some(
      (line) =>
        line.construction === null &&
        !line.removing &&
        line.stationIds.includes(stationId),
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
