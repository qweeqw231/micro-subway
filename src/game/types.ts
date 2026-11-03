export type StationType = 'residential' | 'work' | 'commercial' | 'leisure';

export interface StationDefinition {
  id: string;
  x: number;
  y: number;
  type: StationType;
}

export interface DemoMap {
  id: string;
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
}

export interface HudSnapshot {
  week: number;
  day: number;
  clock: string;
  delivered: number;
  maxQueue: number;
  lineCount: number;
  totalLineStations: number;
  lineSlots: number;
  lines: LineHudInfo[];
  failed: boolean;
  failure: FailureInfo | null;
}
