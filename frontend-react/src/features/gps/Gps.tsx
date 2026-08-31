import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Building2, MapPinned } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader/PageHeader';
import { PageLoader } from '../../components/ui/PageLoader/PageLoader';
import { getApiErrorMessage } from '../../core/api/errors';
import { useAuth } from '../../core/auth/authState';
import { rrhhService } from '../rrhh/rrhh.service';
import type { Site } from '../rrhh/types';
import { LiveLocationPanel } from './LiveLocationPanel';
import styles from './Gps.module.css';

export function Gps() {
  const { user } = useAuth();
  const canViewAllSites = user?.alcance !== 'SEDE';
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState<number | null>(user?.sede_id ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void rrhhService.getCatalogs(controller.signal)
      .then(data => setSites(data.sites))
      .catch(loadError => { if (!axios.isCancel(loadError)) setError(loadError); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const selectedSites = useMemo(() => siteId === null ? sites : sites.filter(site => site.id === siteId), [siteId, sites]);
  const selectedSite = sites.find(site => site.id === siteId);

  const scopeLabel = selectedSite?.name ?? (canViewAllSites ? 'Todas las sedes' : user?.sede_nombre ?? 'Sede operativa');

  return <main className={`main ${styles.page}`} id="main-content">
    <PageHeader icon={<MapPinned />} title="Rastreo GPS" subtitle="Supervisión operativa y recorridos del personal autorizado" metadata={scopeLabel} tone="corporate" />
    <section className={styles.content}>
      <div className={styles.toolbar}>
        <div className={styles.scopeIntro}><span>COBERTURA OPERATIVA</span><strong>{scopeLabel}</strong><small>Se muestran únicamente colaboradores con seguimiento continuo habilitado.</small></div>
        <label className={styles.sitePicker}><Building2 /><span><small>Ámbito de monitoreo</small><select aria-label="Alcance del mapa" value={siteId ?? 'all'} onChange={event => setSiteId(event.target.value === 'all' ? null : Number(event.target.value))}>{canViewAllSites && <option value="all">Todas las sedes</option>}{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></span></label>
      </div>
      {loading ? <PageLoader label="Preparando mapa operativo" /> : error ? <div className={styles.error} role="alert">{getApiErrorMessage(error, 'No se pudo preparar el monitoreo GPS.')}</div> : <LiveLocationPanel sites={selectedSites} variant="full" />}
    </section>
  </main>;
}
