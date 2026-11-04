import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { getMap } from '../game/maps';
import { params } from '../game/params';
import {
  createSaveFile,
  parseSaveFile,
  saveFileName,
  type SaveFileV1,
} from '../game/save/schema';
import { Simulation } from '../game/simulation';
import type { GameMap, HudSnapshot, Station } from '../game/types';
import { t } from '../i18n';
import { webSaveRepository } from '../platform/web/storage';
import type { SaveSummary } from '../platform/types';
import { renderScene, type DragState } from '../render/renderer';
import { FailurePanel } from '../ui/FailurePanel';
import { Hud } from '../ui/Hud';
import { LineDock } from '../ui/LineDock';
import { MapPicker } from '../ui/MapPicker';
import { SavePanel } from '../ui/SavePanel';
import { TutorialTip } from '../ui/TutorialTip';
import { WeeklyModal } from '../ui/WeeklyModal';

const SEED = 20261103;

function createSimulation(map: GameMap): Simulation {
  return new Simulation(map, SEED);
}

export function App() {
  const simulationRef = useRef<Simulation | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pausedRef = useRef(false);
  const speedRef = useRef(1);
  const selectedLineIdRef = useRef<string | null>(null);
  const tutorialStepRef = useRef(0);

  const [mapId, setMapId] = useState<string | null>(null);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [dragActive, setDragActive] = useState(false);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const [rewireMode, setRewireMode] = useState<'start' | 'end' | null>(null);
  const [tutorialStep, setTutorialStep] = useState(99);
  const [notice, setNotice] = useState<string | null>(null);
  const [bridgeNotice, setBridgeNotice] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [currentSlot, setCurrentSlot] = useState(1);
  const [slots, setSlots] = useState<SaveSummary[]>([]);

  selectedLineIdRef.current = selectedLineId;
  tutorialStepRef.current = tutorialStep;

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (
      selectedLineId &&
      hud &&
      !hud.lines.some((line) => line.id === selectedLineId)
    ) {
      setSelectedLineId(null);
    }
  }, [hud, selectedLineId]);

  useEffect(() => {
    if (!hud || tutorialStep >= 99) {
      return;
    }

    if (tutorialStep === 1 && hud.delivered > 0) {
      setTutorialStep(2);
    } else if (tutorialStep === 2 && hud.weekly) {
      setTutorialStep(3);
    } else if (tutorialStep === 3 && !hud.weekly && hud.week >= 2) {
      setTutorialStep(4);
    } else if (
      tutorialStep === 4 &&
      hud.maxQueue >= params.stations.capacity
    ) {
      setTutorialStep(5);
    }
  }, [hud, tutorialStep]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const simulation = simulationRef.current;
    if (!canvas || !simulation) {
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
      const activeSimulation = simulationRef.current;
      const elapsed = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      if (activeSimulation) {
        if (!pausedRef.current && !activeSimulation.state.failed) {
          accumulator += elapsed * speedRef.current;
          let steps = 0;
          while (accumulator >= tickStep && steps < 5) {
            activeSimulation.tick(tickStep);
            accumulator -= tickStep;
            steps += 1;
          }
        } else {
          accumulator = 0;
        }

        renderScene(ctx, activeSimulation.state, activeSimulation.map, {
          drag: dragRef.current,
          selectedLineId: selectedLineIdRef.current,
        });

        if (now - lastHudTime >= hudInterval) {
          setHud(activeSimulation.getHud());
          lastHudTime = now;
        }
      }

      animationFrame = requestAnimationFrame(frame);
    };

    animationFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrame);
  }, [mapId]);

  const selectMap = useCallback((id: string) => {
    const map = getMap(id);
    if (!map) {
      return;
    }

    const simulation = createSimulation(map);
    simulationRef.current = simulation;
    dragRef.current = null;
    pausedRef.current = map.tutorial;
    speedRef.current = 1;
    setMapId(id);
    setHud(simulation.getHud());
    setPaused(map.tutorial);
    setSpeed(1);
    setDragActive(false);
    setSelectedLineId(null);
    setSelectedColorIndex(0);
    setRewireMode(null);
    setTutorialStep(map.tutorial ? 0 : 99);
    setNotice(null);
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

  const hitRadiusFor = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): number => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') {
      return params.ui.stationHitRadiusPx;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const logicalPerCss = params.ui.logicalWidth / rect.width;
    return Math.max(
      params.ui.stationHitRadiusPx,
      (params.ui.minTouchTargetPx / 2) * logicalPerCss,
    );
  };

  const findStationAt = (
    x: number,
    y: number,
    radius = params.ui.stationHitRadiusPx,
  ) => {
    const simulation = simulationRef.current;
    if (!simulation) {
      return null;
    }

    let nearest: Station | null = null;
    let nearestDistance = radius;
    for (const station of simulation.state.stations) {
      if (!station.active) {
        continue;
      }
      const distance = Math.hypot(station.x - x, station.y - y);
      if (distance <= nearestDistance) {
        nearest = station;
        nearestDistance = distance;
      }
    }
    return nearest;
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

    if (line.construction || line.removing) {
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
    const station = findStationAt(point.x, point.y, hitRadiusFor(event));

    if (rewireMode) {
      const line = getSelectedLine();
      if (
        station &&
        line &&
        !line.construction &&
        !line.removing &&
        !line.stationIds.includes(station.id)
      ) {
        const changed =
          rewireMode === 'start'
            ? simulation.replaceFirstStation(line.id, station.id)
            : simulation.replaceLastStation(line.id, station.id);
        if (!changed && simulation.lastActionError === 'bridge') {
          setNotice(t('hint.needBridge'));
        }
        setRewireMode(null);
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
      crossing: false,
      bridgeAllowed: true,
    };
    setBridgeNotice(null);
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
    const station = findStationAt(point.x, point.y, hitRadiusFor(event));
    const simulation = simulationRef.current;
    let crossing = false;
    let bridgeAllowed = true;
    let nextBridgeNotice: string | null = null;

    if (simulation && station) {
      const line = getSelectedLine();
      let candidateIds: string[] | null = null;

      if (line && !line.stationIds.includes(station.id)) {
        candidateIds =
          drag.endpoint === 'start'
            ? [station.id, ...line.stationIds]
            : [...line.stationIds, station.id];
      } else if (!line) {
        candidateIds = [drag.startStationId, station.id];
      }

      if (candidateIds) {
        const preview = simulation.previewBridges(
          line?.id ?? null,
          candidateIds,
        );
        crossing = preview.crossings > 0;
        bridgeAllowed = preview.allowed;
        if (crossing) {
          nextBridgeNotice = bridgeAllowed
            ? t('hint.bridgePreview', {
                crossings: preview.crossings,
                used: preview.used,
                capacity: preview.capacity,
              })
            : t('hint.needBridge');
        }
      }
    }

    dragRef.current = {
      ...drag,
      x: point.x,
      y: point.y,
      hoverStationId: station?.id ?? null,
      crossing,
      bridgeAllowed,
    };
    setBridgeNotice(nextBridgeNotice);
  };

  const clearDrag = (event?: ReactPointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    setDragActive(false);
    setBridgeNotice(null);
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
    let failedBecauseBridge = false;

    if (line) {
      if (target && !line.stationIds.includes(target.id)) {
        const changed = simulation.appendStation(
          line.id,
          target.id,
          drag.endpoint,
        );
        failedBecauseBridge =
          !changed && simulation.lastActionError === 'bridge';
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
        if (
          tutorialStepRef.current === 0 &&
          simulation.map.tutorial
        ) {
          pausedRef.current = false;
          setPaused(false);
          setTutorialStep(1);
        }
      } else {
        failedBecauseBridge = simulation.lastActionError === 'bridge';
      }
    }

    if (failedBecauseBridge) {
      setNotice(t('hint.needBridge'));
    } else {
      setNotice(null);
    }
    setHud(simulation.getHud());
    clearDrag(event);
  };

  const handlePointerCancel = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    clearDrag(event);
  };

  const selectSlot = useCallback((colorIndex: number) => {
    const simulation = simulationRef.current;
    if (!simulation) {
      return;
    }

    const line = simulation.state.lines.find(
      (entry) => entry.colorIndex === colorIndex,
    );
    setSelectedColorIndex(colorIndex);
    setSelectedLineId(line?.id ?? null);
    setRewireMode(null);
  }, []);

  const deleteSelectedLine = useCallback(() => {
    const simulation = simulationRef.current;
    const line = getSelectedLine();
    if (!simulation || !line) {
      return;
    }
    simulation.deleteLine(line.id);
    setRewireMode(null);
    setHud(simulation.getHud());
  }, [selectedLineId]);

  const removeSelectedEnd = useCallback(() => {
    const simulation = simulationRef.current;
    const line = getSelectedLine();
    if (!simulation || !line) {
      return;
    }
    simulation.removeLastStation(line.id);
    setRewireMode(null);
    setHud(simulation.getHud());
  }, [selectedLineId]);

  const toggleRewire = useCallback(
    (endpoint: 'start' | 'end') => {
      const line = getSelectedLine();
      if (!line || line.construction || line.removing) {
        return;
      }
      setRewireMode((current) => (current === endpoint ? null : endpoint));
    },
    [selectedLineId],
  );

  const togglePause = useCallback(() => {
    if (hud?.failed) {
      return;
    }
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
  }, [hud?.failed]);

  const toggleSpeed = useCallback(() => {
    const speeds = params.time.speeds;
    const currentIndex = speeds.indexOf(speedRef.current);
    const next = speeds[(currentIndex + 1) % speeds.length] ?? speeds[0];
    speedRef.current = next;
    setSpeed(next);
  }, []);

  const restart = useCallback(() => {
    if (!mapId) {
      return;
    }
    const map = getMap(mapId);
    if (!map) {
      return;
    }

    const simulation = createSimulation(map);
    simulationRef.current = simulation;
    dragRef.current = null;
    pausedRef.current = map.tutorial;
    speedRef.current = 1;
    setDragActive(false);
    setPaused(map.tutorial);
    setSpeed(1);
    setSelectedLineId(null);
    setSelectedColorIndex(0);
    setRewireMode(null);
    setTutorialStep(map.tutorial ? 0 : 99);
    setNotice(null);
    setHud(simulation.getHud());
  }, [mapId]);

  const skipTutorial = useCallback(() => {
    pausedRef.current = false;
    setPaused(false);
    setTutorialStep(99);
  }, []);

  const showWeeklyCards = useCallback(() => {
    const simulation = simulationRef.current;
    if (!simulation) {
      return;
    }
    simulation.advanceWeeklyToCards();
    setHud(simulation.getHud());
  }, []);

  const chooseUpgrade = useCallback((cardId: string) => {
    const simulation = simulationRef.current;
    if (!simulation) {
      return;
    }
    simulation.chooseUpgrade(cardId);
    setHud(simulation.getHud());
  }, []);

  const confirmUpgradeTarget = useCallback((targetIds: string[]) => {
    const simulation = simulationRef.current;
    if (!simulation) {
      return;
    }
    simulation.confirmUpgradeTarget(targetIds);
    setHud(simulation.getHud());
  }, []);

  const refreshSlots = useCallback(() => {
    setSlots(webSaveRepository.list());
  }, []);

  const openSavePanel = useCallback(() => {
    refreshSlots();
    setSaveOpen(true);
  }, [refreshSlots]);

  const buildSave = useCallback(
    (slot: number): SaveFileV1 | null => {
      const simulation = simulationRef.current;
      if (!simulation || !mapId) {
        return null;
      }
      return createSaveFile(
        simulation.exportSnapshot(),
        mapId,
        slot,
        tutorialStepRef.current,
      );
    },
    [mapId],
  );

  const saveToSlot = useCallback(
    (slot: number) => {
      const save = buildSave(slot);
      if (!save) {
        return;
      }
      webSaveRepository.write(slot, save);
      setCurrentSlot(slot);
      refreshSlots();
      setNotice(t('save.saved', { slot }));
    },
    [buildSave, refreshSlots],
  );

  const loadSaveFile = useCallback(
    (save: SaveFileV1) => {
      const map = getMap(save.mapId);
      if (!map) {
        setNotice(t('save.error'));
        return;
      }

      const simulation = Simulation.fromSnapshot(map, save.snapshot);
      simulationRef.current = simulation;
      dragRef.current = null;
      pausedRef.current = false;
      speedRef.current = 1;
      setMapId(save.mapId);
      setHud(simulation.getHud());
      setPaused(false);
      setSpeed(1);
      setSelectedLineId(null);
      setSelectedColorIndex(0);
      setRewireMode(null);
      setTutorialStep(save.ui?.tutorialStep ?? 99);
      setCurrentSlot(save.slot);
      setSaveOpen(false);
      setNotice(t('save.loaded'));
      refreshSlots();
    },
    [refreshSlots],
  );

  const loadSlot = useCallback(
    (slot: number) => {
      const save = webSaveRepository.read(slot);
      if (!save) {
        setNotice(t('save.error'));
        return;
      }
      loadSaveFile(save);
    },
    [loadSaveFile],
  );

  const exportSlot = useCallback((slot: number) => {
    const save = webSaveRepository.read(slot);
    if (!save) {
      return;
    }
    const blob = new Blob([JSON.stringify(save, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = saveFileName(slot);
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const importSave = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const save = parseSaveFile(JSON.parse(text));
        webSaveRepository.backup(save.slot);
        webSaveRepository.write(save.slot, save);
        loadSaveFile(save);
      } catch {
        setNotice(t('save.error'));
      }
    },
    [loadSaveFile],
  );

  useEffect(() => {
    if (!mapId) {
      return;
    }
    const interval = window.setInterval(() => {
      const save = buildSave(currentSlot);
      if (save) {
        webSaveRepository.write(currentSlot, save);
        refreshSlots();
      }
    }, params.save.autosaveIntervalSec * 1000);

    return () => window.clearInterval(interval);
  }, [mapId, currentSlot, buildSave, refreshSlots]);

  if (!mapId || !hud) {
    return <MapPicker onSelect={selectMap} />;
  }

  const selectedLine = hud.lines.find((line) => line.id === selectedLineId) ?? null;
  const baseHint = hud.failed
    ? ''
    : rewireMode
      ? t('hint.rewire')
      : dragActive
        ? t('hint.release')
        : selectedLine
          ? selectedLine.constructionKind || selectedLine.removing
            ? t('hint.lineLocked')
            : t('hint.appendSelected')
          : hud.lineCount > 0
            ? t('hint.drawNewLine')
            : t('hint.drawLine');
  const hint = notice ?? bridgeNotice ?? baseHint;

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
        onOpenSave={openSavePanel}
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
        {tutorialStep <= 5 && hud.weekly === null && (
          <TutorialTip step={tutorialStep} onSkip={skipTutorial} />
        )}
        {hud.failed && hud.failure && (
          <FailurePanel
            failure={hud.failure}
            delivered={hud.delivered}
            onRestart={restart}
          />
        )}
        {hud.weekly && (
          <WeeklyModal
            hud={hud}
            weekly={hud.weekly}
            tutorialHint={
              tutorialStep === 3 ? t('tutorial.step3') : undefined
            }
            onShowCards={showWeeklyCards}
            onChoose={chooseUpgrade}
            onConfirm={confirmUpgradeTarget}
          />
        )}
      </main>

      {saveOpen && (
        <SavePanel
          slots={slots}
          currentSlot={currentSlot}
          onSelectSlot={setCurrentSlot}
          onSave={saveToSlot}
          onLoad={loadSlot}
          onExport={exportSlot}
          onImport={importSave}
          onClose={() => setSaveOpen(false)}
        />
      )}
    </div>
  );
}
