import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { demoMap } from '../game/demo-map';
import { params } from '../game/params';
import { Simulation } from '../game/simulation';
import type { HudSnapshot } from '../game/types';
import { t } from '../i18n';
import { renderScene, type DragState } from '../render/renderer';
import { FailurePanel } from '../ui/FailurePanel';
import { Hud } from '../ui/Hud';
import { LineDock } from '../ui/LineDock';

const SEED = 20261103;

function createSimulation(): Simulation {
  return new Simulation(demoMap, SEED);
}

export function App() {
  const simulationRef = useRef<Simulation | null>(null);
  if (simulationRef.current === null) {
    simulationRef.current = createSimulation();
  }

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pausedRef = useRef(false);
  const speedRef = useRef(1);
  const selectedLineIdRef = useRef<string | null>(null);

  const [hud, setHud] = useState<HudSnapshot>(() => simulationRef.current!.getHud());
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [dragActive, setDragActive] = useState(false);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const [rewireMode, setRewireMode] = useState(false);

  selectedLineIdRef.current = selectedLineId;

  useEffect(() => {
    if (
      selectedLineId &&
      !hud.lines.some((line) => line.id === selectedLineId)
    ) {
      setSelectedLineId(null);
    }
  }, [hud.lines, selectedLineId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = params.ui.logicalWidth * dpr;
    canvas.height = params.ui.logicalHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let animationFrame = 0;
    let lastTime = performance.now();
    let lastHudTime = 0;
    let accumulator = 0;
    const tickStep = 1 / params.time.tickHz;
    const hudInterval = 1000 / params.ui.hudRefreshHz;

    const frame = (now: number) => {
      const simulation = simulationRef.current;
      const elapsed = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      if (simulation) {
        if (!pausedRef.current && !simulation.state.failed) {
          accumulator += elapsed * speedRef.current;
          let steps = 0;
          while (accumulator >= tickStep && steps < 5) {
            simulation.tick(tickStep);
            accumulator -= tickStep;
            steps += 1;
          }
        } else {
          accumulator = 0;
        }

        renderScene(ctx, simulation.state, {
          drag: dragRef.current,
          selectedLineId: selectedLineIdRef.current,
        });

        if (now - lastHudTime >= hudInterval) {
          setHud(simulation.getHud());
          lastHudTime = now;
        }
      }

      animationFrame = requestAnimationFrame(frame);
    };

    animationFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const pointerToLogical = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): { x: number; y: number } => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scaleX = params.ui.logicalWidth / rect.width;
    const scaleY = params.ui.logicalHeight / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const findStationAt = (x: number, y: number) => {
    const simulation = simulationRef.current;
    if (!simulation) {
      return null;
    }

    return (
      simulation.state.stations.find(
        (station) =>
          Math.hypot(station.x - x, station.y - y) <=
          params.ui.stationHitRadiusPx,
      ) ?? null
    );
  };

  const getSelectedLine = () => {
    const simulation = simulationRef.current;
    if (!simulation || !selectedLineId) {
      return null;
    }
    return simulation.state.lines.find((line) => line.id === selectedLineId) ?? null;
  };

  const canStartDrag = (stationId: string): boolean => {
    const simulation = simulationRef.current;
    if (!simulation || rewireMode) {
      return false;
    }

    const line = getSelectedLine();
    if (!line) {
      return selectedLineId === null;
    }

    if (line.construction) {
      return false;
    }

    return (
      stationId === line.stationIds[0] ||
      stationId === line.stationIds[line.stationIds.length - 1]
    );
  };

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    const simulation = simulationRef.current;
    if (!simulation || simulation.state.failed) {
      return;
    }

    const point = pointerToLogical(event);
    const station = findStationAt(point.x, point.y);

    if (rewireMode) {
      const line = getSelectedLine();
      if (
        station &&
        line &&
        !line.construction &&
        !line.stationIds.includes(station.id)
      ) {
        simulation.replaceLastStation(line.id, station.id);
        setRewireMode(false);
        setHud(simulation.getHud());
      }
      return;
    }

    if (!station || !canStartDrag(station.id)) {
      return;
    }

    const line = getSelectedLine();
    const color = line?.color ?? params.lines.colors[selectedColorIndex];
    const endpoint =
      line && station.id === line.stationIds[0] ? 'start' : 'end';
    dragRef.current = {
      startStationId: station.id,
      endpoint,
      x: point.x,
      y: point.y,
      hoverStationId: null,
      color,
    };
    setDragActive(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }

    const point = pointerToLogical(event);
    const station = findStationAt(point.x, point.y);
    dragRef.current = {
      ...drag,
      x: point.x,
      y: point.y,
      hoverStationId: station?.id ?? null,
    };
  };

  const clearDrag = (event?: ReactPointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    setDragActive(false);
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerUp = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    const drag = dragRef.current;
    const simulation = simulationRef.current;
    if (!drag || !simulation) {
      clearDrag(event);
      return;
    }

    const point = pointerToLogical(event);
    const target = findStationAt(point.x, point.y);
    const line = getSelectedLine();

    if (line) {
      if (target && !line.stationIds.includes(target.id)) {
        simulation.appendStation(line.id, target.id, drag.endpoint);
      } else if (
        !target &&
        line.stationIds.length > params.lines.minStationsPerLine
      ) {
        if (drag.endpoint === 'start') {
          simulation.removeFirstStation(line.id);
        } else {
          simulation.removeLastStation(line.id);
        }
      }
    } else if (selectedLineId === null && target && target.id !== drag.startStationId) {
      const lineId = simulation.createLine(
        [drag.startStationId, target.id],
        selectedColorIndex,
      );
      if (lineId) {
        setSelectedLineId(lineId);
      }
    }

    setHud(simulation.getHud());
    clearDrag(event);
  };

  const handlePointerCancel = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    clearDrag(event);
  };

  const selectSlot = useCallback(
    (colorIndex: number) => {
      const simulation = simulationRef.current;
      if (!simulation) {
        return;
      }

      const line = simulation.state.lines.find(
        (entry) => entry.colorIndex === colorIndex,
      );
      setSelectedColorIndex(colorIndex);
      setSelectedLineId(line?.id ?? null);
      setRewireMode(false);
    },
    [],
  );

  const deleteSelectedLine = useCallback(() => {
    const simulation = simulationRef.current;
    const line = getSelectedLine();
    if (!simulation || !line) {
      return;
    }
    simulation.deleteLine(line.id);
    setRewireMode(false);
    setHud(simulation.getHud());
  }, [selectedLineId]);

  const removeSelectedEnd = useCallback(() => {
    const simulation = simulationRef.current;
    const line = getSelectedLine();
    if (!simulation || !line) {
      return;
    }
    simulation.removeLastStation(line.id);
    setRewireMode(false);
    setHud(simulation.getHud());
  }, [selectedLineId]);

  const toggleRewire = useCallback(() => {
    const line = getSelectedLine();
    if (!line || line.construction) {
      return;
    }
    setRewireMode((current) => !current);
  }, [selectedLineId]);

  const togglePause = useCallback(() => {
    if (hud.failed) {
      return;
    }
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
  }, [hud.failed]);

  const toggleSpeed = useCallback(() => {
    const next = speedRef.current === 1 ? 2 : 1;
    speedRef.current = next;
    setSpeed(next);
  }, []);

  const restart = useCallback(() => {
    simulationRef.current = createSimulation();
    dragRef.current = null;
    pausedRef.current = false;
    speedRef.current = 1;
    setDragActive(false);
    setPaused(false);
    setSpeed(1);
    setSelectedLineId(null);
    setSelectedColorIndex(0);
    setRewireMode(false);
    setHud(simulationRef.current.getHud());
  }, []);

  const selectedLine = hud.lines.find((line) => line.id === selectedLineId) ?? null;
  const hint = hud.failed
    ? ''
    : rewireMode
      ? t('hint.rewire')
      : dragActive
        ? t('hint.release')
        : selectedLine
          ? selectedLine.constructionKind
            ? t('hint.lineLocked')
            : t('hint.appendSelected')
          : hud.lineCount > 0
            ? t('hint.drawNewLine')
            : t('hint.drawLine');

  return (
    <div className="app">
      <Hud
        hud={hud}
        paused={paused}
        speed={speed}
        hint={hint}
        onTogglePause={togglePause}
        onToggleSpeed={toggleSpeed}
        onRestart={restart}
      />

      <LineDock
        hud={hud}
        selectedLineId={selectedLineId}
        selectedColorIndex={selectedColorIndex}
        rewireMode={rewireMode}
        onSelectSlot={selectSlot}
        onDelete={deleteSelectedLine}
        onRemoveEnd={removeSelectedEnd}
        onRewire={toggleRewire}
      />

      <main className="stage">
        <canvas
          ref={canvasRef}
          className="game-canvas"
          aria-label={t('canvas.aria')}
          role="img"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        />
        {hud.failed && hud.failure && (
          <FailurePanel
            failure={hud.failure}
            delivered={hud.delivered}
            onRestart={restart}
          />
        )}
      </main>
    </div>
  );
}
