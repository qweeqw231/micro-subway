export type StationType = 'residential' | 'work' | 'commercial' | 'leisure';

export interface Point {
  x: number;
  y: number;
}

export interface StationDefinition extends Point {
  id: string;
  type: StationType;
  appearWeek: number;
}

export interface GameMap {
  id: string;
  nameKey: string;
  descKey: string;
  difficultyKey: string;
  tutorial: boolean;
  outline: Point[];
  water: Point[][];
  parks: Point[][];
  startDayProgress: number;
  demandScale: number;
  overloadGraceSec: number;
  stations: StationDefinition[];
}

export interface RouteStep {
  lineId: string;
  dir: 1 | -1;
  fromStationId: string;
  toStationId: string;
  cost: number;
}

export interface RoutePlan {
  steps: RouteStep[];
  transfers: number;
  cost: number;
}

export interface Passenger {
  id: number;
  destType: StationType;
  targetStationId: string;
  spawnedAtSec: number;
  route: RoutePlan | null;
  stepIndex: number;
  rerouteCheck: boolean;
}

export interface Station extends StationDefinition {
  active: boolean;
  capacity: number;
  queue: Passenger[];
  overloadSec: number;
  nextSpawnSec: number;
}

export interface LineConstruction {
  kind: 'create' | 'edit' | 'delete';
  endSec: number;
  newStationIds: string[] | null;
}

export interface Line {
  id: string;
  colorIndex: number;
  color: string;
  stationIds: string[];
  construction: LineConstruction | null;
  removing: boolean;
  carriageLevel: number;
}

export interface Train {
  id: string;
  lineId: string;
  currentIndex: number;
  nextIndex: number;
  direction: 1 | -1;
  progress: number;
  state: 'dwell' | 'moving';
  dwellSec: number;
  capacity: number;
  passengers: Passenger[];
}

export interface SimStats {
  delivered: number;
  spawned: number;
  lost: number;
  maxQueue: number;
}

export type UpgradeKind =
  | 'train'
  | 'carriage'
  | 'lineSlot'
  | 'bridge'
  | 'stationExpansion'
  | 'speed'
  | 'grace';

export interface UpgradeCard {
  id: string;
  kind: UpgradeKind;
}

export interface WeeklySummary {
  completedWeek: number;
  delivered: number;
  maxQueue: number;
  newStations: number;
}

export interface WeeklyState {
  phase: 'summary' | 'cards';
  summary: WeeklySummary;
  cards: UpgradeCard[];
}

export interface SimState {
  tick: number;
  elapsedSec: number;
  week: number;
  dayIndex: number;
  dayProgress: number;
  lines: Line[];
  trains: Train[];
  stations: Station[];
  stats: SimStats;
  failed: boolean;
  failureStationId: string | null;
  unlockedLineSlots: number;
  bridgeCapacity: number;
  speedMultiplier: number;
  graceBonusSec: number;
  speedStacks: number;
  graceStacks: number;
  weekly: WeeklyState | null;
  weekStartDelivered: number;
  weekMaxQueue: number;
}

export interface FailureInfo {
  stationType: StationType;
  queue: number;
  capacity: number;
  seconds: number;
}

export interface LineHudInfo {
  id: string;
  colorIndex: number;
  color: string;
  stationCount: number;
  constructionKind: 'create' | 'edit' | 'delete' | null;
  constructionSec: number;
  removing: boolean;
  trainCount: number;
  carriageLevel: number;
}

export interface HudSnapshot {
  mapId: string;
  mapNameKey: string;
  week: number;
  day: number;
  clock: string;
  delivered: number;
  maxQueue: number;
  lineCount: number;
  totalLineStations: number;
  lineSlots: number;
  bridgesUsed: number;
  bridgeCapacity: number;
  lines: LineHudInfo[];
  weekly: WeeklyState | null;
  failed: boolean;
  failure: FailureInfo | null;
}
