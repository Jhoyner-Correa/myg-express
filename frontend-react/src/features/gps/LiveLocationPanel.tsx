import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { BatteryMedium, ChevronRight, LocateFixed, MapPin, Navigation, RadioTower, RefreshCw } from 'lucide-react';
import { divIcon, latLngBounds } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { getApiErrorMessage } from '../../core/api/errors';
import { getMovementLabel, getSignalHealth } from './domain';
import { gpsService } from './gps.service';
import type { GpsSiteScope, LiveGpsPosition } from './types';
import styles from './LiveLocationPanel.module.css';

type Props = {
  sites: GpsSiteScope[];
  variant?: 'compact' | 'full';
  onOpenFullMap?: () => void;
};

function lastUpdateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin hora registrada';
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (elapsedMinutes < 1) return 'Actualizado ahora';
  if (elapsedMinutes < 60) return `Hace ${elapsedMinutes} min`;
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit' }).format(date);
}

function PositionViewport({ positions, selected }: { positions: LiveGpsPosition[]; selected: LiveGpsPosition | null }) {
  const map = useMap();

  useEffect(() => {
    if (selected) {
      map.flyTo([selected.latitude, selected.longitude], Math.max(map.getZoom(), 15), { duration: .55 });
      return;
    }
    const onlyPosition = positions.at(0);
    if (positions.length === 1 && onlyPosition) {
      map.setView([onlyPosition.latitude, onlyPosition.longitude], 15);
      return;
    }
    if (positions.length > 1) {
      map.fitBounds(latLngBounds(positions.map(position => [position.latitude, position.longitude])), { padding: [38, 38], maxZoom: 16 });
    }
  }, [map, positions, selected]);

  return null;
}

function markerIcon(index: number, position: LiveGpsPosition, selected: boolean) {
  const health = getSignalHealth(position.updatedAt);
  const tone = health === 'offline' ? styles.markerOffline : position.movement === 'VEHICULO' ? styles.markerRoute : styles.markerActive;
  return divIcon({
    className: styles.markerRoot,
    html: `<span class="${styles.mapMarker} ${tone} ${selected ? styles.markerSelected : ''}"><b>${index + 1}</b></span>`,
    iconSize: [30, 38],
    iconAnchor: [15, 36],
    popupAnchor: [0, -34],
  });
}

export function LiveLocationPanel({ sites, variant = 'compact', onOpenFullMap }: Props) {
  const [positions, setPositions] = useState<LiveGpsPosition[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
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
      setSelectedId(current => current !== null && data.some(position => position.employeeId === current) ? current : null);
    } catch (loadError) {
      if (!axios.isCancel(loadError)) setError(loadError);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [normalizedSites]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void load(controller.signal, true);
    const timer = window.setInterval(() => void load(controller.signal, true), 30_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [load]);

  const selected = positions.find(position => position.employeeId === selectedId) ?? null;
  const visiblePositions = variant === 'compact' ? positions.slice(0, 3) : positions;
  const onlineCount = positions.filter(position => getSignalHealth(position.updatedAt) === 'online').length;

  return <article className={`${styles.panel} ${variant === 'full' ? styles.full : styles.compact}`}>
    <header className={styles.header}>
      <div className={styles.title}><span><MapPin /></span><div><h2>Ubicación en tiempo real</h2><p>{positions.length ? `${onlineCount} de ${positions.length} señales activas` : 'Monitoreo del personal autorizado'}</p></div></div>
      <div className={styles.headerActions}>
        {variant === 'full' && <button className={styles.refreshButton} type="button" onClick={() => void load()} disabled={refreshing} aria-label="Actualizar ubicaciones"><RefreshCw className={refreshing ? styles.spinning : ''} />Actualizar</button>}
        {onOpenFullMap && <button className={styles.openButton} type="button" onClick={onOpenFullMap}>Ver mapa completo <ChevronRight /></button>}
      </div>
    </header>

    <div className={styles.body}>
      <div className={styles.mapStage}>
        {positions.length ? <MapContainer className={styles.map} center={[-11.8, -75.2]} zoom={6} zoomControl={variant === 'full'} scrollWheelZoom={variant === 'full'}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <PositionViewport positions={positions} selected={selected} />
          {positions.map((position, index) => <Marker key={position.employeeId} position={[position.latitude, position.longitude]} icon={markerIcon(index, position, position.employeeId === selectedId)} eventHandlers={{ click: () => setSelectedId(position.employeeId) }}><Popup><strong>{position.names} {position.lastNames}</strong><br />{position.siteName}<br />{getMovementLabel(position)}</Popup></Marker>)}
        </MapContainer> : <div className={styles.mapEmpty}><span><LocateFixed /></span><strong>{loading ? 'Consultando ubicaciones' : 'Sin ubicaciones activas'}</strong><small>{error ? getApiErrorMessage(error, 'No se pudo consultar el GPS.') : 'Las posiciones aparecerán al iniciar una jornada con rastreo.'}</small></div>}
      </div>

      <aside className={styles.positionRail} aria-label="Personal monitoreado">
        <div className={styles.positionList}>{visiblePositions.map((position, index) => {
          const health = getSignalHealth(position.updatedAt);
          return <button type="button" key={position.employeeId} className={position.employeeId === selectedId ? styles.positionSelected : ''} onClick={() => setSelectedId(position.employeeId)}>
            <span className={`${styles.positionIndex} ${styles[`signal${health}`]}`}>{index + 1}</span>
            <span className={styles.positionIdentity}><strong>{position.names} {position.lastNames}</strong><small>{getMovementLabel(position)} · {position.siteName}</small></span>
            <i className={`${styles.signalDot} ${styles[`signal${health}`]}`} />
          </button>;
        })}{!positions.length && !loading && <div className={styles.railEmpty}><RadioTower /><span>Esperando transmisión</span></div>}</div>
        {selected && <div className={styles.positionDetails}><div><Navigation /><span><strong>{Math.round(selected.speedKmh)} km/h</strong><small>Velocidad</small></span></div><div><BatteryMedium /><span><strong>{selected.batteryPercent === null ? '—' : `${Math.round(selected.batteryPercent)}%`}</strong><small>Batería</small></span></div><p>{lastUpdateLabel(selected.updatedAt)}{selected.accuracyMeters === null ? '' : ` · ±${Math.round(selected.accuracyMeters)} m`}</p></div>}
      </aside>
    </div>
  </article>;
}
