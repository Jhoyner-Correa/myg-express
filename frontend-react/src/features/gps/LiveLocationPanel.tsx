import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  BatteryMedium,
  ChevronRight,
  Clock3,
  Gauge,
  LocateFixed,
  MapPin,
  Navigation,
  RadioTower,
  RefreshCw,
  Route,
  Search,
  UsersRound,
} from 'lucide-react';
import { divIcon, latLngBounds } from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { mapTileConfig } from '../../config/mapConfig';
import { getApiErrorMessage } from '../../core/api/errors';
import { employeePhotoFallbackHandler, getEmployeePhotoUrl } from '../rrhh/components/employee-avatar';
import {
  getAccuracyHealth,
  getMovementLabel,
  getShiftLabel,
  getSignalAgeMinutes,
  getSignalHealth,
  getSignalLabel,
  hasCoordinates,
  type SignalHealth,
} from './domain';
import { gpsService } from './gps.service';
import type { GpsHistoryPoint, GpsSiteScope, LiveGpsPosition } from './types';
import styles from './LiveLocationPanel.module.css';

type Props = {
  sites: GpsSiteScope[];
  variant?: 'compact' | 'full';
  onOpenFullMap?: () => void;
};

type SignalFilter = 'all' | SignalHealth;

function businessDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function lastUpdateLabel(value: string | null) {
  const age = getSignalAgeMinutes(value);
  if (age === null) return 'Nunca reportó ubicación';
  if (age < 1) return 'Actualizado ahora';
  if (age < 60) return `Actualizado hace ${age} min`;
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return 'Hora no disponible';
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit',
  }).format(date);
}

function PositionViewport({ positions, selected, history }: {
  positions: Array<LiveGpsPosition & { latitude: number; longitude: number }>;
  selected: LiveGpsPosition | null;
  history: GpsHistoryPoint[];
}) {
  const map = useMap();

  useEffect(() => {
    if (history.length > 1) {
      map.fitBounds(latLngBounds(history.map(point => [point.latitude, point.longitude])), {
        padding: [42, 42], maxZoom: 17,
      });
      return;
    }
    if (selected && hasCoordinates(selected)) {
      map.flyTo([selected.latitude, selected.longitude], Math.max(map.getZoom(), 15), { duration: .55 });
      return;
    }
    if (positions.length === 1 && positions[0]) {
      map.setView([positions[0].latitude, positions[0].longitude], 15);
      return;
    }
    if (positions.length > 1) {
      map.fitBounds(latLngBounds(positions.map(position => [position.latitude, position.longitude])), {
        padding: [38, 38], maxZoom: 16,
      });
    }
  }, [history, map, positions, selected]);

  return null;
}

function markerIcon(index: number, position: LiveGpsPosition, selected: boolean) {
  const health = getSignalHealth(position.updatedAt);
  const tone = health === 'offline'
    ? styles.markerOffline
    : health === 'stale'
      ? styles.markerStale
      : position.movement === 'VEHICULO'
        ? styles.markerRoute
        : styles.markerActive;
  return divIcon({
    className: styles.markerRoot,
    html: `<span class="${styles.mapMarker} ${tone} ${selected ? styles.markerSelected : ''}"><b>${index + 1}</b></span>`,
    iconSize: [32, 40], iconAnchor: [16, 38], popupAnchor: [0, -36],
  });
}

function employeeAvatar(position: LiveGpsPosition) {
  return {
    id: position.employeeId,
    sexo: position.gender,
    foto: position.photo,
  };
}

export function LiveLocationPanel({ sites, variant = 'compact', onOpenFullMap }: Props) {
  const [positions, setPositions] = useState<LiveGpsPosition[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('all');
  const [history, setHistory] = useState<GpsHistoryPoint[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [tileProviderUnavailable, setTileProviderUnavailable] = useState(false);

  const normalizedSites = useMemo(() => {
    const unique = new Map<number, GpsSiteScope>();
    sites.forEach(site => unique.set(site.id, site));
    return [...unique.values()].sort((left, right) => left.id - right.id);
  }, [sites]);

  const load = useCallback(async (signal?: AbortSignal, quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const data = await gpsService.getLivePositions(normalizedSites, signal);
      setPositions(data);
      setError(null);
      setSelectedId(current => current !== null && data.some(position => position.employeeId === current)
        ? current
        : variant === 'full' ? data.at(0)?.employeeId ?? null : null);
    } catch (loadError) {
      if (!axios.isCancel(loadError)) setError(loadError);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [normalizedSites, variant]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void load(controller.signal, true);
    const timer = window.setInterval(() => void load(controller.signal, true), 20_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    setHistory([]);
    setShowHistory(false);
    setHistoryError('');
  }, [selectedId]);

  const selected = positions.find(position => position.employeeId === selectedId) ?? null;
  const summary = useMemo(() => ({
    total: positions.length,
    online: positions.filter(position => getSignalHealth(position.updatedAt) === 'online').length,
    stale: positions.filter(position => getSignalHealth(position.updatedAt) === 'stale').length,
    offline: positions.filter(position => getSignalHealth(position.updatedAt) === 'offline').length,
  }), [positions]);

  const filteredPositions = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es');
    return positions.filter(position => {
      const matchesSignal = signalFilter === 'all' || getSignalHealth(position.updatedAt) === signalFilter;
      const searchable = `${position.names} ${position.lastNames} ${position.employeeCode} ${position.jobRole} ${position.siteName}`.toLocaleLowerCase('es');
      return matchesSignal && (!term || searchable.includes(term));
    });
  }, [positions, query, signalFilter]);

  const visiblePositions = variant === 'compact' ? filteredPositions.slice(0, 3) : filteredPositions;
  const mappedPositions = filteredPositions.filter(hasCoordinates);

  const toggleHistory = async () => {
    if (!selected) return;
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    if (history.length) {
      setShowHistory(true);
      return;
    }
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const points = await gpsService.getEmployeeHistory(selected.employeeId, businessDate());
      setHistory(points);
      setShowHistory(points.length > 0);
      if (!points.length) setHistoryError('Este colaborador aún no tiene recorrido registrado hoy.');
    } catch (historyLoadError) {
      setHistoryError(getApiErrorMessage(historyLoadError, 'No se pudo consultar el recorrido.'));
    } finally {
      setHistoryLoading(false);
    }
  };

  return <article className={`${styles.panel} ${variant === 'full' ? styles.full : styles.compact}`}>
    <header className={styles.header}>
      <div className={styles.title}>
        <span><MapPin /></span>
        <div><h2>Centro de monitoreo GPS</h2><p>Ubicación y estado operativo del personal autorizado</p></div>
      </div>
      <div className={styles.headerActions}>
        {variant === 'full' && <span className={styles.autoRefresh}><i /> Actualización automática · 20 s</span>}
        {variant === 'full' && <button className={styles.refreshButton} type="button" onClick={() => void load()} disabled={refreshing}>
          <RefreshCw className={refreshing ? styles.spinning : ''} />Actualizar
        </button>}
        {onOpenFullMap && <button className={styles.openButton} type="button" onClick={onOpenFullMap}>Ver mapa completo <ChevronRight /></button>}
      </div>
    </header>

    {variant === 'full' && <div className={styles.summary} aria-label="Resumen de conectividad GPS">
      <button type="button" className={signalFilter === 'all' ? styles.summarySelected : ''} onClick={() => setSignalFilter('all')}>
        <UsersRound /><span><small>Personal monitoreado</small><strong>{summary.total}</strong></span>
      </button>
      <button type="button" className={signalFilter === 'online' ? styles.summarySelected : ''} onClick={() => setSignalFilter('online')}>
        <RadioTower /><span><small>En línea</small><strong>{summary.online}</strong></span><i className={styles.onlineDot} />
      </button>
      <button type="button" className={signalFilter === 'stale' ? styles.summarySelected : ''} onClick={() => setSignalFilter('stale')}>
        <Clock3 /><span><small>Señal demorada</small><strong>{summary.stale}</strong></span><i className={styles.staleDot} />
      </button>
      <button type="button" className={signalFilter === 'offline' ? styles.summarySelected : ''} onClick={() => setSignalFilter('offline')}>
        <LocateFixed /><span><small>Sin conexión</small><strong>{summary.offline}</strong></span><i className={styles.offlineDot} />
      </button>
    </div>}

    <div className={styles.body}>
      <div className={styles.mapStage}>
        {mappedPositions.length ? <MapContainer className={styles.map} center={[-11.8, -75.2]} zoom={6} maxZoom={mapTileConfig.maxZoom} zoomControl={variant === 'full'} scrollWheelZoom={variant === 'full'}>
          <TileLayer
            attribution={mapTileConfig.attribution}
            url={mapTileConfig.tileUrl}
            maxZoom={mapTileConfig.maxZoom}
            keepBuffer={2}
            updateWhenIdle
            eventHandlers={{
              tileerror: () => setTileProviderUnavailable(true),
              tileload: () => setTileProviderUnavailable(false),
            }}
          />
          <PositionViewport positions={mappedPositions} selected={selected} history={showHistory ? history : []} />
          {showHistory && history.length > 1 && <Polyline positions={history.map(point => [point.latitude, point.longitude])} pathOptions={{ color: '#1f6fd1', weight: 4, opacity: .82 }} />}
          {mappedPositions.map((position, index) => <Marker
            key={position.employeeId}
            position={[position.latitude, position.longitude]}
            icon={markerIcon(index, position, position.employeeId === selectedId)}
            eventHandlers={{ click: () => setSelectedId(position.employeeId) }}
          ><Popup><strong>{position.names} {position.lastNames}</strong><br />{position.siteName}<br />{getMovementLabel(position)}</Popup></Marker>)}
        </MapContainer> : <div className={styles.mapEmpty}>
          <span><LocateFixed /></span>
          <strong>{loading ? 'Consultando ubicaciones' : 'Sin coordenadas disponibles'}</strong>
          <small>{error ? getApiErrorMessage(error, 'No se pudo consultar el GPS.') : 'El mapa se activará cuando un colaborador con rastreo continuo transmita una ubicación.'}</small>
        </div>}
        {tileProviderUnavailable && <div className={styles.mapProviderWarning} role="status">
          <LocateFixed />
          <span><strong>Mapa base no disponible</strong><small>El seguimiento GPS continúa activo. Reintentaremos con {mapTileConfig.providerName}.</small></span>
        </div>}
        {variant === 'full' && <div className={styles.mapLegend}><span><i className={styles.onlineDot} />En línea</span><span><i className={styles.staleDot} />Demorada</span><span><i className={styles.offlineDot} />Sin conexión</span></div>}
      </div>

      <aside className={styles.positionRail} aria-label="Personal monitoreado">
        {variant === 'full' && <div className={styles.railTools}>
          <label><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar colaborador..." aria-label="Buscar colaborador monitoreado" /></label>
          <select value={signalFilter} onChange={event => setSignalFilter(event.target.value as SignalFilter)} aria-label="Filtrar por estado de señal">
            <option value="all">Todos los estados</option><option value="online">En línea</option><option value="stale">Señal demorada</option><option value="offline">Sin conexión</option>
          </select>
        </div>}

        <div className={styles.positionList}>{visiblePositions.map(position => {
          const health = getSignalHealth(position.updatedAt);
          const avatar = employeeAvatar(position);
          return <button type="button" key={position.employeeId} className={position.employeeId === selectedId ? styles.positionSelected : ''} onClick={() => setSelectedId(position.employeeId)}>
            <img src={getEmployeePhotoUrl(avatar)} onError={employeePhotoFallbackHandler(avatar)} alt="" />
            <span className={styles.positionIdentity}>
              <strong>{position.names} {position.lastNames}</strong>
              <small>{position.jobRole} · {position.siteName}</small>
              <em className={styles[`text${health}`]}><i className={styles[`signal${health}`]} />{getSignalLabel(position.updatedAt)}</em>
            </span>
            <ChevronRight />
          </button>;
        })}{!visiblePositions.length && !loading && <div className={styles.railEmpty}><RadioTower /><strong>Sin resultados</strong><span>No hay colaboradores que coincidan con el filtro.</span></div>}</div>

        {selected && variant === 'full' && <section className={styles.positionDetails}>
          <div className={styles.detailHeading}>
            <div><strong>{getMovementLabel(selected)}</strong><span>{getShiftLabel(selected.shiftState)}</span></div>
            <span className={`${styles.signalBadge} ${styles[`badge${getSignalHealth(selected.updatedAt)}`]}`}>{getSignalLabel(selected.updatedAt)}</span>
          </div>
          <div className={styles.telemetry}>
            <div><Navigation /><span><strong>{Math.round(selected.speedKmh)} km/h</strong><small>Velocidad</small></span></div>
            <div><BatteryMedium /><span><strong>{selected.batteryPercent === null ? '—' : `${Math.round(selected.batteryPercent)}%`}</strong><small>Batería</small></span></div>
            <div><Gauge /><span><strong>{selected.accuracyMeters === null ? '—' : `±${Math.round(selected.accuracyMeters)} m`}</strong><small>Precisión · {getAccuracyHealth(selected.accuracyMeters) === 'good' ? 'buena' : getAccuracyHealth(selected.accuracyMeters) === 'fair' ? 'media' : getAccuracyHealth(selected.accuracyMeters) === 'poor' ? 'baja' : 'sin dato'}</small></span></div>
          </div>
          <p>{lastUpdateLabel(selected.updatedAt)}</p>
          <button type="button" className={styles.historyButton} disabled={historyLoading || !hasCoordinates(selected)} onClick={() => void toggleHistory()}>
            <Route />{historyLoading ? 'Consultando recorrido...' : showHistory ? 'Ocultar recorrido' : 'Ver recorrido de hoy'}
          </button>
          {historyError && <small className={styles.historyMessage}>{historyError}</small>}
        </section>}
      </aside>
    </div>
  </article>;
}
