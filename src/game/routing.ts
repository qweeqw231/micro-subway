import { params } from './params';
import type {
  Line,
  RoutePlan,
  RouteStep,
  SimState,
  Station,
  StationType,
} from './types';

interface QueueState {
  key: string;
  stationId: string;
  lineId: string;
  dir: 1 | -1;
  transfers: number;
  cost: number;
}

interface Previous {
  prevKey: string;
  step: RouteStep | null;
}

class MinHeap {
  private readonly items: QueueState[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: QueueState): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): QueueState | undefined {
    if (this.items.length === 0) {
      return undefined;
    }

    const first = this.items[0];
    const last = this.items.pop();
    if (last && this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return first;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].cost <= this.items[index].cost) {
        break;
      }
      [this.items[parent], this.items[index]] = [
        this.items[index],
        this.items[parent],
      ];
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;

      if (
        left < this.items.length &&
        this.items[left].cost < this.items[smallest].cost
      ) {
        smallest = left;
      }
      if (
        right < this.items.length &&
        this.items[right].cost < this.items[smallest].cost
      ) {
        smallest = right;
      }
      if (smallest === index) {
        return;
      }

      [this.items[index], this.items[smallest]] = [
        this.items[smallest],
        this.items[index],
      ];
      index = smallest;
    }
  }
}

export function findRoute(
  state: SimState,
  originStationId: string,
  destType: StationType,
): RoutePlan | null {
  const origin = stationById(state, originStationId);
  if (!origin) {
    return null;
  }

  const activeLines = state.lines.filter(isActiveLine);
  if (activeLines.length === 0) {
    return null;
  }

  const hasDestination = state.stations.some(
    (station) => station.type === destType,
  );
  if (!hasDestination) {
    return null;
  }

  const heap = new MinHeap();
  const distances = new Map<string, number>();
  const previous = new Map<string, Previous>();

  for (const line of activeLines) {
    const index = line.stationIds.indexOf(originStationId);
    if (index === -1) {
      continue;
    }

    for (const dir of availableDirections(line, index)) {
      const key = stateKey(originStationId, line.id, dir, 0);
      const cost = waitForLine(state, line);
      distances.set(key, cost);
      heap.push({
        key,
        stationId: originStationId,
        lineId: line.id,
        dir,
        transfers: 0,
        cost,
      });
    }
  }

  const maxTransfers = params.routing.maxTransfers;

  while (heap.size > 0) {
    const current = heap.pop();
    if (!current) {
      break;
    }

    if (current.cost !== distances.get(current.key)) {
      continue;
    }

    const station = stationById(state, current.stationId);
    if (station?.type === destType) {
      return reconstruct(current, previous);
    }

    const line = lineById(state, current.lineId);
    if (!line) {
      continue;
    }

    const index = line.stationIds.indexOf(current.stationId);
    const nextIndex = index + current.dir;
    if (index !== -1 && nextIndex >= 0 && nextIndex < line.stationIds.length) {
      const toStationId = line.stationIds[nextIndex];
      const edgeCost = segmentCost(state, line, index, nextIndex);
      const key = stateKey(
        toStationId,
        line.id,
        current.dir,
        current.transfers,
      );
      const cost = current.cost + edgeCost;

      if (cost < (distances.get(key) ?? Number.POSITIVE_INFINITY)) {
        distances.set(key, cost);
        previous.set(key, {
          prevKey: current.key,
          step: {
            lineId: line.id,
            dir: current.dir,
            fromStationId: current.stationId,
            toStationId,
            cost: edgeCost,
          },
        });
        heap.push({
          key,
          stationId: toStationId,
          lineId: line.id,
          dir: current.dir,
          transfers: current.transfers,
          cost,
        });
      }
    }

    if (current.transfers >= maxTransfers) {
      continue;
    }

    for (const nextLine of activeLines) {
      if (nextLine.id === line.id) {
        continue;
      }

      const nextStationIndex = nextLine.stationIds.indexOf(current.stationId);
      if (nextStationIndex === -1) {
        continue;
      }

      const transferCost =
        params.routing.transferPenaltySec +
        waitForLine(state, nextLine) +
        congestionPenalty(station);

      for (const dir of availableDirections(nextLine, nextStationIndex)) {
        const key = stateKey(
          current.stationId,
          nextLine.id,
          dir,
          current.transfers + 1,
        );
        const cost = current.cost + transferCost;

        if (cost < (distances.get(key) ?? Number.POSITIVE_INFINITY)) {
          distances.set(key, cost);
          previous.set(key, {
            prevKey: current.key,
            step: null,
          });
          heap.push({
            key,
            stationId: current.stationId,
            lineId: nextLine.id,
            dir,
            transfers: current.transfers + 1,
            cost,
          });
        }
      }
    }
  }

  return null;
}

export function estimateRemainingCost(
  state: SimState,
  plan: RoutePlan,
  stationId: string,
  stepIndex: number,
  includeInitialWait: boolean,
  allowConstructingLineId?: string,
): number {
  if (stepIndex < 0 || stepIndex >= plan.steps.length) {
    return Number.POSITIVE_INFINITY;
  }

  const firstStep = plan.steps[stepIndex];
  if (firstStep.fromStationId !== stationId) {
    return Number.POSITIVE_INFINITY;
  }

  let total = 0;
  const firstLine = lineById(state, firstStep.lineId);
  if (
    !firstLine ||
    (firstLine.construction !== null &&
      firstLine.id !== allowConstructingLineId)
  ) {
    return Number.POSITIVE_INFINITY;
  }

  if (includeInitialWait) {
    const wait = waitForLine(state, firstLine);
    if (!Number.isFinite(wait)) {
      return Number.POSITIVE_INFINITY;
    }
    total += wait;
  }

  let previousLineId: string | null = null;
  for (let index = stepIndex; index < plan.steps.length; index += 1) {
    const step = plan.steps[index];
    const line = lineById(state, step.lineId);
    if (
      !line ||
      line.removing ||
      (line.construction !== null &&
        line.id !== allowConstructingLineId)
    ) {
      return Number.POSITIVE_INFINITY;
    }

    if (previousLineId !== null && previousLineId !== step.lineId) {
      const wait = waitForLine(state, line);
      if (!Number.isFinite(wait)) {
        return Number.POSITIVE_INFINITY;
      }
      total +=
        params.routing.transferPenaltySec +
        wait +
        congestionPenalty(stationById(state, step.fromStationId));
    }

    total += step.cost;
    previousLineId = line.id;
  }

  return total;
}

export function isRouteValid(
  state: SimState,
  plan: RoutePlan,
  stationId: string,
  stepIndex: number,
  allowConstructingLineId?: string,
): boolean {
  if (stepIndex < 0 || stepIndex >= plan.steps.length) {
    return false;
  }

  let expectedFrom = stationId;
  for (let index = stepIndex; index < plan.steps.length; index += 1) {
    const step = plan.steps[index];
    if (step.fromStationId !== expectedFrom) {
      return false;
    }

    const line = lineById(state, step.lineId);
    if (
      !line ||
      line.removing ||
      (line.construction !== null &&
        line.id !== allowConstructingLineId)
    ) {
      return false;
    }

    const fromIndex = line.stationIds.indexOf(step.fromStationId);
    const toIndex = line.stationIds.indexOf(step.toStationId);
    if (fromIndex === -1 || toIndex === -1 || toIndex !== fromIndex + step.dir) {
      return false;
    }

    expectedFrom = step.toStationId;
  }

  return true;
}

function reconstruct(target: QueueState, previous: Map<string, Previous>): RoutePlan {
  const steps: RouteStep[] = [];
  let key = target.key;

  while (previous.has(key)) {
    const entry = previous.get(key);
    if (!entry) {
      break;
    }
    if (entry.step) {
      steps.push(entry.step);
    }
    key = entry.prevKey;
  }

  steps.reverse();
  return {
    steps,
    transfers: target.transfers,
    cost: target.cost,
  };
}

function isActiveLine(line: Line): boolean {
  return line.construction === null && !line.removing && line.stationIds.length >= 2;
}

function availableDirections(line: Line, index: number): Array<1 | -1> {
  const directions: Array<1 | -1> = [];
  if (index > 0) {
    directions.push(-1);
  }
  if (index < line.stationIds.length - 1) {
    directions.push(1);
  }
  return directions;
}

function stateKey(
  stationId: string,
  lineId: string,
  dir: 1 | -1,
  transfers: number,
): string {
  return `${stationId}|${lineId}|${dir}|${transfers}`;
}

function segmentCost(
  state: SimState,
  line: Line,
  fromIndex: number,
  toIndex: number,
): number {
  const from = stationById(state, line.stationIds[fromIndex]);
  const to = stationById(state, line.stationIds[toIndex]);
  if (!from || !to) {
    return Number.POSITIVE_INFINITY;
  }

  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  return (
    distance / (params.trains.speedPxPerSec * state.speedMultiplier) +
    params.trains.accelPenaltySec +
    params.trains.dwellBaseSec
  );
}

function waitForLine(state: SimState, line: Line): number {
  const trains = state.trains.filter((train) => train.lineId === line.id).length;
  if (trains === 0 || line.stationIds.length < 2) {
    return Number.POSITIVE_INFINITY;
  }

  let oneWay = 0;
  for (let index = 0; index < line.stationIds.length - 1; index += 1) {
    oneWay += segmentCost(state, line, index, index + 1);
  }
  oneWay += params.trains.dwellBaseSec * line.stationIds.length;

  const roundTrip = oneWay * 2;
  const headway = roundTrip / trains;
  return headway / 2;
}

function congestionPenalty(station: Station | undefined): number {
  if (!station) {
    return 0;
  }

  const ratio = station.queue.length / Math.max(1, station.capacity);
  if (ratio > params.routing.criticalCongestionThreshold) {
    return params.routing.criticalCongestionPenaltySec;
  }
  if (ratio > params.routing.congestionThreshold) {
    return params.routing.congestionPenaltySec;
  }
  return 0;
}

function stationById(state: SimState, id: string): Station | undefined {
  return state.stations.find((station) => station.id === id);
}

function lineById(state: SimState, id: string): Line | undefined {
  return state.lines.find((line) => line.id === id);
}
