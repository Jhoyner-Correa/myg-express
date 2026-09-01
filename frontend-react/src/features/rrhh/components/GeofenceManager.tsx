import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Building2, CheckCircle2, Crosshair, MapPin, Navigation, ShieldCheck } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { rrhhService } from '../rrhh.service';
import type { Geofence, Site } from '../types';
import styles from '../Rrhh.module.css';
import { validateGeofenceDraft, type GeofenceDraft } from './geofence-form';
import { capturePreciseSiteLocation, type CapturedSiteLocation } from './site-location-capture';

type Props = {
  siteId: number;
  sites: Site[];
  geofences: Geofence[];
  canManage: boolean;
  onSiteChange: (siteId: number) => void;
  onCatalogChanged: () => Promise<void>;
};

const emptyGeofence: GeofenceDraft = {
  latitude: '', longitude: '', radius_meters: '30', maximum_accuracy_meters: '20',
};

function draftFromGeofence(value?: Geofence): GeofenceDraft {
  if (!value) return emptyGeofence;
  return {
    latitude: String(value.latitude),
    longitude: String(value.longitude),
    radius_meters: String(value.radius_meters),
    maximum_accuracy_meters: String(value.maximum_accuracy_meters),
  };
}

function formatUpdatedAt(value?: string) {
  if (!value) return 'Pendiente de configurar';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Configurada';
  return `Actualizada ${new Intl.DateTimeFormat('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Lima',
  }).format(date)}`;
}

export function GeofenceManager({ siteId, sites, geofences, canManage, onSiteChange, onCatalogChanged }: Props) {
  const configuredBySite = useMemo(() => new Map(geofences.map(item => [item.site_id, item])), [geofences]);
  const selectedSite = sites.find(site => site.id === siteId) ?? sites[0];
  const selectedGeofence = configuredBySite.get(siteId);
  const [draft, setDraft] = useState<GeofenceDraft>(() => draftFromGeofence(selectedGeofence));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [bestAccuracy, setBestAccuracy] = useState<number | null>(null);
  const [capturedLocation, setCapturedLocation] = useState<CapturedSiteLocation | null>(null);

  useEffect(() => {
    setDraft(draftFromGeofence(selectedGeofence));
    setError(null);
    setBestAccuracy(null);
    setCapturedLocation(null);
  }, [siteId, selectedGeofence]);

  const updateDraft = (field: keyof GeofenceDraft, value: string) => {
    setDraft(current => ({ ...current, [field]: value }));
    setCapturedLocation(null);
    setBestAccuracy(null);
    setError(null);
  };

  const captureLocation = async () => {
    setCapturing(true);
    setError(null);
    setBestAccuracy(null);
    try {
      const location = await capturePreciseSiteLocation(undefined, {
        onSample: sample => setBestAccuracy(sample.accuracyMeters),
      });
      setCapturedLocation(location);
      setBestAccuracy(location.accuracyMeters);
      setDraft(current => ({
        ...current,
        latitude: location.latitude.toFixed(8),
        longitude: location.longitude.toFixed(8),
      }));
      showToast(`Punto central capturado con ${Math.round(location.accuracyMeters)} m de precisión.`, 'success');
    } catch (captureFailure) {
      const message = captureFailure instanceof Error ? captureFailure.message : 'No se pudo capturar la ubicación.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setCapturing(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const validation = validateGeofenceDraft(draft);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await rrhhService.saveGeofence(siteId, {
        ...validation.value,
        capture_method: capturedLocation ? 'DEVICE_GPS' : 'MANUAL',
        capture_accuracy_meters: capturedLocation?.accuracyMeters,
      });
      await onCatalogChanged();
      showToast(`Geocerca de ${selectedSite?.name ?? 'la sede'} actualizada correctamente.`, 'success');
    } catch (saveError) {
      const message = getApiErrorMessage(saveError, 'No se pudo guardar la geocerca.');
      setError(message);
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return <section className={`${styles.configCard} ${styles.geofenceManager}`}>
    <header className={styles.settingsCardHeader}>
      <span><MapPin /></span>
      <div>
        <small>CONTROL DE UBICACIÓN</small>
        <h2>Geocercas por sede</h2>
        <p>Define el punto físico autorizado para registrar asistencia.</p>
      </div>
      <strong className={styles.configurationProgress}>{geofences.length} de {sites.length} configuradas</strong>
    </header>

    <div className={styles.geofenceWorkspace}>
      <aside className={styles.siteConfigurationRail} aria-label="Sedes de la empresa">
        <div><strong>Sedes operativas</strong><small>Selecciona el local que vas a configurar</small></div>
        <nav>
          {sites.map(site => {
            const configured = configuredBySite.has(site.id);
            return <button
              type="button"
              key={site.id}
              className={site.id === siteId ? styles.siteConfigurationActive : ''}
              aria-current={site.id === siteId ? 'true' : undefined}
              disabled={capturing || saving}
              onClick={() => onSiteChange(site.id)}
            >
              <span><Building2 /></span>
              <span><strong>{site.name}</strong><small>{configured ? 'Geocerca configurada' : 'Requiere configuración'}</small></span>
              <i className={configured ? styles.siteConfigured : styles.sitePending}>{configured ? <CheckCircle2 /> : null}</i>
            </button>;
          })}
        </nav>
      </aside>

      <div className={styles.geofenceEditor}>
        <div className={styles.selectedSiteSummary}>
          <div><small>SEDE SELECCIONADA</small><h3>{selectedSite?.name}</h3><p>{formatUpdatedAt(selectedGeofence?.updated_at)}</p></div>
          <span className={selectedGeofence ? styles.configuredBadge : styles.pendingBadge}>{selectedGeofence ? 'Operativa' : 'Pendiente'}</span>
        </div>

        <div className={styles.geofenceOverview}>
          <section className={styles.locationCapturePanel}>
            <span><Crosshair /></span>
            <div>
              <small className={styles.captureEyebrow}>MÉTODO RECOMENDADO</small>
              <strong>Captura presencial del punto central</strong>
              <p>Cuando estés físicamente dentro de <b>{selectedSite?.name}</b>, abre esta pantalla desde el celular y captura su ubicación.</p>
              {capturing && <small>Buscando la mejor señal GPS{bestAccuracy ? ` · precisión actual ${Math.round(bestAccuracy)} m` : '…'}</small>}
              {!capturing && capturedLocation && <small className={styles.captureSuccess}><CheckCircle2 /> Punto obtenido con {Math.round(capturedLocation.accuracyMeters)} m de precisión</small>}
            </div>
            {canManage && <Button type="button" variant="corporate" icon={<Navigation />} loading={capturing} disabled={saving} onClick={() => void captureLocation()}>
              {capturing ? 'Capturando GPS' : 'Capturar ubicación aquí'}
            </Button>}
          </section>

          <aside className={styles.geofenceCoveragePreview} aria-label="Resumen de cobertura configurada">
            <div className={styles.coveragePreviewHeader}><span>COBERTURA OPERATIVA</span><strong>{selectedSite?.name}</strong></div>
            <div className={styles.coverageTarget}><i /><i /><span><MapPin /></span></div>
            <dl>
              <div><dt>Radio</dt><dd>{draft.radius_meters || '—'} m</dd></div>
              <div><dt>Precisión</dt><dd>≤ {draft.maximum_accuracy_meters || '—'} m</dd></div>
            </dl>
          </aside>
        </div>

        <form className={styles.geofenceForm} onSubmit={save}>
          <header className={styles.geofenceFormHeader}><div><strong>Parámetros de validación</strong><small>Ajustes técnicos aplicados al momento de marcar asistencia</small></div><span>{capturedLocation ? 'Origen: GPS del dispositivo' : 'Origen: ingreso manual'}</span></header>
          <div className={styles.coordinateFields}>
            <label>Latitud<input type="text" inputMode="decimal" required value={draft.latitude} onChange={event => updateDraft('latitude', event.target.value)} placeholder="Ej. -11.252721" disabled={!canManage || saving || capturing} /></label>
            <label>Longitud<input type="text" inputMode="decimal" required value={draft.longitude} onChange={event => updateDraft('longitude', event.target.value)} placeholder="Ej. -74.638612" disabled={!canManage || saving || capturing} /></label>
          </div>
          <div className={styles.geofencePolicyFields}>
            <label><span>Radio autorizado</span><small>Distancia máxima desde el punto central</small><div><input type="number" min="10" max="1000" step="1" required value={draft.radius_meters} onChange={event => updateDraft('radius_meters', event.target.value)} disabled={!canManage || saving} /><b>metros</b></div></label>
            <label><span>Precisión GPS exigida</span><small>Menor valor significa una validación más estricta</small><div><input type="number" min="5" max="100" step="1" required value={draft.maximum_accuracy_meters} onChange={event => updateDraft('maximum_accuracy_meters', event.target.value)} disabled={!canManage || saving} /><b>metros</b></div></label>
          </div>
          <div className={styles.geofenceGuidance}><ShieldCheck /><p><strong>Configuración recomendada para oficinas</strong><span>Radio de 30 m y precisión máxima de 20 m. No captures el punto si no estás dentro del local seleccionado.</span></p></div>
          {error && <p className={styles.formError} role="alert">{error}</p>}
          {canManage && <footer><Button type="submit" variant="corporate" icon={<MapPin />} loading={saving} disabled={capturing}>Guardar geocerca de {selectedSite?.name}</Button></footer>}
        </form>
      </div>
    </div>
  </section>;
}
