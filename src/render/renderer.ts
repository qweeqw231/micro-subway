import { params } from '../game/params';
import type {
  GameMap,
  Point,
  SimState,
  Station,
  StationType,
  Train,
} from '../game/types';
import { theme } from './theme';

export interface DragState {
  startStationId: string;
  endpoint: 'start' | 'end';
  x: number;
  y: number;
  hoverStationId: string | null;
  color: string;
  crossing: boolean;
  bridgeAllowed: boolean;
}

export interface RenderView {
  drag: DragState | null;
  selectedLineId: string | null;
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  map: GameMap,
  view: RenderView,
): void {
  const width = params.ui.logicalWidth;
  const height = params.ui.logicalHeight;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = theme.paper;
  ctx.fillRect(0, 0, width, height);

  drawMap(ctx, map);
  drawLines(ctx, state, view.selectedLineId);
  drawStations(ctx, state, view);

  for (const train of state.trains) {
    drawTrain(ctx, state, train);
  }

  drawDragPreview(ctx, state, view);
}

function drawMap(ctx: CanvasRenderingContext2D, map: GameMap): void {
  drawPolygon(ctx, map.outline, theme.land);
  ctx.strokeStyle = 'rgba(32, 36, 43, 0.12)';
  ctx.lineWidth = 1.5;
  drawPolygonPath(ctx, map.outline);
  ctx.stroke();

  for (const park of map.parks) {
    drawPolygon(ctx, park, theme.park);
  }
  for (const water of map.water) {
    drawPolygon(ctx, water, theme.water);
  }
}

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  fill: string,
): void {
  if (points.length < 3) {
    return;
  }
  drawPolygonPath(ctx, points);
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawPolygonPath(
  ctx: CanvasRenderingContext2D,
  points: Point[],
): void {
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.closePath();
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  selectedLineId: string | null,
): void {
  for (const line of state.lines) {
    const selected = line.id === selectedLineId;
    const width = selected ? theme.lineWidth + 2 : theme.lineWidth;

    if (line.removing) {
      drawLinePath(
        ctx,
        state,
        line.stationIds,
        theme.muted,
        width,
        true,
        0.55,
      );
      continue;
    }

    if (line.construction?.kind === 'create') {
      drawLinePath(
        ctx,
        state,
        line.construction.newStationIds ?? line.stationIds,
        line.color,
        width,
        true,
        1,
      );
      continue;
    }

    if (line.construction?.kind === 'edit') {
      drawLinePath(
        ctx,
        state,
        line.stationIds,
        line.color,
        width,
        false,
        0.35,
      );
      drawLinePath(
        ctx,
        state,
        line.construction.newStationIds ?? line.stationIds,
        line.color,
        width,
        true,
        1,
      );
      continue;
    }

    if (line.construction?.kind === 'delete') {
      drawLinePath(
        ctx,
        state,
        line.stationIds,
        theme.muted,
        width,
        true,
        0.55,
      );
      continue;
    }

    drawLinePath(ctx, state, line.stationIds, line.color, width, false, 1);
  }
}

function drawLinePath(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  stationIds: string[],
  color: string,
  width: number,
  dashed: boolean,
  alpha: number,
): void {
  if (stationIds.length < 2) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.setLineDash(dashed ? [10, 7] : []);
  ctx.beginPath();

  stationIds.forEach((stationId, index) => {
    const station = stationById(state, stationId);
    if (index === 0) {
      ctx.moveTo(station.x, station.y);
    } else {
      ctx.lineTo(station.x, station.y);
    }
  });

  ctx.stroke();
  ctx.restore();
}

function drawStations(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  view: RenderView,
): void {
  const connected = new Set<string>();
  for (const line of state.lines) {
    for (const stationId of line.stationIds) {
      connected.add(stationId);
    }
    for (const stationId of line.construction?.newStationIds ?? []) {
      connected.add(stationId);
    }
  }

  const targetId = view.drag?.hoverStationId ?? null;

  for (const station of state.stations) {
    if (!station.active) {
      continue;
    }

    const isConnected = connected.has(station.id);

    if (!isConnected) {
      ctx.strokeStyle = theme.muted;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(station.x, station.y, theme.connectedRing, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const highlight =
      station.id === targetId ||
      (view.drag && view.drag.startStationId === station.id);

    drawGlyph(
      ctx,
      station.type,
      station.x,
      station.y,
      theme.stationRadius,
      theme.paper,
      highlight ? (view.drag?.color ?? theme.ink) : theme.ink,
      highlight ? 3 : 2,
    );

    drawQueue(ctx, station);
    drawOverloadRing(ctx, station);
  }
}

function drawQueue(ctx: CanvasRenderingContext2D, station: Station): void {
  const visible = Math.min(station.queue.length, params.ui.queueVisibleCount);
  if (visible === 0) {
    return;
  }

  const spacing = 11;
  const startX = station.x - ((visible - 1) * spacing) / 2;
  const y = station.y + 26;

  for (let index = 0; index < visible; index += 1) {
    const passenger = station.queue[index];
    drawGlyph(
      ctx,
      passenger.destType,
      startX + index * spacing,
      y,
      theme.tokenRadius,
      theme.ink,
      theme.ink,
      0,
    );
  }

  if (station.queue.length > visible) {
    ctx.fillStyle = theme.ink;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`+${station.queue.length - visible}`, station.x, y + 18);
  }
}

function drawOverloadRing(
  ctx: CanvasRenderingContext2D,
  station: Station,
): void {
  if (station.overloadSec <= 0) {
    return;
  }

  const ratio = Math.min(
    1,
    station.overloadSec / params.stations.overloadGraceSec,
  );
  ctx.strokeStyle = ratio >= 0.66 ? theme.danger : theme.warning;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(
    station.x,
    station.y,
    theme.connectedRing + 3,
    -Math.PI / 2,
    -Math.PI / 2 + ratio * Math.PI * 2,
  );
  ctx.stroke();
}

function drawTrain(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  train: Train,
): void {
  const line = state.lines.find((entry) => entry.id === train.lineId);
  if (!line) {
    return;
  }

  const from = stationById(state, line.stationIds[train.currentIndex]);
  const to = stationById(state, line.stationIds[train.nextIndex]);
  const progress = train.state === 'moving' ? train.progress : 0;
  const x = from.x + (to.x - from.x) * progress;
  const y = from.y + (to.y - from.y) * progress;
  const angle = Math.atan2(to.y - from.y, to.x - from.x);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = line.color;
  roundRectPath(
    ctx,
    -theme.trainWidth / 2,
    -theme.trainHeight / 2,
    theme.trainWidth,
    theme.trainHeight,
    3,
  );
  ctx.fill();

  ctx.fillStyle = theme.paper;
  ctx.beginPath();
  ctx.moveTo(theme.trainWidth / 2 - 2, 0);
  ctx.lineTo(theme.trainWidth / 2 - 7, -4);
  ctx.lineTo(theme.trainWidth / 2 - 7, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawDragPreview(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  view: RenderView,
): void {
  const drag = view.drag;
  if (!drag) {
    return;
  }

  const start = stationById(state, drag.startStationId);
  const target = drag.hoverStationId
    ? stationById(state, drag.hoverStationId)
    : null;
  const endX = target ? target.x : drag.x;
  const endY = target ? target.y : drag.y;

  const previewColor = drag.crossing
    ? drag.bridgeAllowed
      ? theme.warning
      : theme.danger
    : drag.color;

  ctx.strokeStyle = previewColor;
  ctx.lineWidth = 5;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.setLineDash([]);

  if (target) {
    ctx.strokeStyle = previewColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(target.x, target.y, theme.connectedRing + 5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  type: StationType,
  x: number,
  y: number,
  radius: number,
  fill: string,
  stroke: string,
  lineWidth: number,
): void {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;

  ctx.beginPath();
  if (type === 'residential') {
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  } else if (type === 'work') {
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x + radius, y + radius * 0.8);
    ctx.lineTo(x - radius, y + radius * 0.8);
    ctx.closePath();
  } else if (type === 'commercial') {
    ctx.rect(x - radius, y - radius, radius * 2, radius * 2);
  } else {
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x + radius, y);
    ctx.lineTo(x, y + radius);
    ctx.lineTo(x - radius, y);
    ctx.closePath();
  }

  ctx.fill();
  if (lineWidth > 0) {
    ctx.stroke();
  }
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - radius,
    y + height,
  );
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function stationById(state: SimState, id: string): Station {
  const station = state.stations.find((candidate) => candidate.id === id);
  if (!station) {
    throw new Error(`Unknown station: ${id}`);
  }
  return station;
}
