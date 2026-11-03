import { GAME_MAPS } from '../game/maps';
import { params } from '../game/params';
import type { GameMap } from '../game/types';
import { theme } from '../render/theme';
import { t } from '../i18n';

interface MapPickerProps {
  onSelect: (mapId: string) => void;
}

export function MapPicker({ onSelect }: MapPickerProps) {
  return (
    <div className="map-picker">
      <div className="map-picker-head">
        <h1>{t('app.title')}</h1>
        <p>{t('map.pickTitle')}</p>
        <span>{t('map.pickHint')}</span>
      </div>

      <div className="map-grid">
        {GAME_MAPS.map((map) => (
          <MapCard key={map.id} map={map} onSelect={() => onSelect(map.id)} />
        ))}
      </div>
    </div>
  );
}

function MapCard({ map, onSelect }: { map: GameMap; onSelect: () => void }) {
  const tuning = (
    params.maps as Record<string, { initialBridgeTokens?: number }>
  )[map.id];
  const startStations = map.stations.filter(
    (station) => station.appearWeek <= 1,
  ).length;

  return (
    <article className="map-card">
      <MiniMap map={map} />
      <div className="map-card-body">
        <div className="map-card-title">
          <h2>{t(map.nameKey)}</h2>
          <span className="difficulty">{t(map.difficultyKey)}</span>
        </div>
        <p>{t(map.descKey)}</p>
        <div className="map-stats">
          <span>{t('map.stat.stations', { count: startStations })}</span>
          <span>
            {t('map.stat.grace', { seconds: map.overloadGraceSec })}
          </span>
          <span>
            {t('map.stat.bridges', {
              count: tuning?.initialBridgeTokens ?? 0,
            })}
          </span>
        </div>
        <button className="primary" onClick={onSelect}>
          {t('map.start')}
        </button>
      </div>
    </article>
  );
}

function MiniMap({ map }: { map: GameMap }) {
  const points = (polygon: { x: number; y: number }[]) =>
    polygon.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <svg className="mini-map" viewBox="0 0 1280 800" role="img" aria-label={t(map.nameKey)}>
      <polygon points={points(map.outline)} fill={theme.land} />
      {map.parks.map((park, index) => (
        <polygon
          key={`park-${index}`}
          points={points(park)}
          fill={theme.park}
          opacity={0.7}
        />
      ))}
      {map.water.map((water, index) => (
        <polygon
          key={`water-${index}`}
          points={points(water)}
          fill={theme.water}
        />
      ))}
      {map.stations
        .filter((station) => station.appearWeek <= 1)
        .map((station) => (
          <circle
            key={station.id}
            cx={station.x}
            cy={station.y}
            r={11}
            fill={theme.paper}
            stroke={theme.ink}
            strokeWidth={3}
          />
        ))}
    </svg>
  );
}
