import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CalendarDays,
  ChevronDown,
  Download,
  MapPin,
  PackageSearch,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';

import { PageHeader } from '../../../components/ui/PageHeader/PageHeader';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { downloadDispatchCsv } from './exportCsv';
import type {
  UrbanoDispatchGuide,
  UrbanoDispatchListResult,
  UrbanoDispatchResult,
  UrbanoDispatchSite,
  UrbanoDispatchSummary,
  UrbanoGuideDetail,
} from './types';
import { urbanoDispatchService } from './urbanoDispatch.service';
import styles from './UrbanoDispatches.module.css';

function localIsoDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function present(value: unknown, fallback = '—'): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Actualizado ahora'
    : new Intl.DateTimeFormat('es-PE', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Lima',
    }).format(date);
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase();
  if (/salio a entregar|salió a entregar|en reparto|ruta|transito|tránsito|proceso|pend/.test(normalized)) return styles.statusWarning ?? '';
  if (/entregado|complet|cerrad|recibid/.test(normalized)) return styles.statusSuccess ?? '';
  if (/incid|rechaz|devuelt|cancel|fall/.test(normalized)) return styles.statusDanger ?? '';
  return styles.statusNeutral ?? '';
}

function guideStatus(status: string): string {
  return /^\d+$/.test(status.trim()) ? `Estado ${status}` : present(status, 'Sin estado');
}

function admissionState(dispatch: UrbanoDispatchSummary) {
  if (dispatch.totalGuides > 0 && dispatch.admittedGuides >= dispatch.totalGuides) {
    return { label: 'Admitido completo', tone: styles.admissionComplete ?? '' };
  }
  if (dispatch.admittedGuides > 0) {
    return {
      label: `Admisión parcial · ${dispatch.admittedGuides} de ${dispatch.totalGuides} guías`,
      tone: styles.admissionPartial ?? '',
    };
  }
  return { label: 'Pendiente de admisión', tone: styles.admissionPending ?? '' };
}

export const UrbanoDispatches: React.FC = () => {
  const [sites, setSites] = useState<UrbanoDispatchSite[]>([]);
  const [siteId, setSiteId] = useState('');
  const [fromDate, setFromDate] = useState(localIsoDate(-7));
  const [toDate, setToDate] = useState(localIsoDate());
  const [dispatches, setDispatches] = useState<UrbanoDispatchListResult | null>(null);
  const [selected, setSelected] = useState<UrbanoDispatchSummary | null>(null);
  const [result, setResult] = useState<UrbanoDispatchResult | null>(null);
  const [dispatchFilter, setDispatchFilter] = useState('');
  const [guideFilter, setGuideFilter] = useState('');
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const [guideDetails, setGuideDetails] = useState<Record<string, UrbanoGuideDetail>>({});
  const [detailLoadingGuide, setDetailLoadingGuide] = useState<string | null>(null);
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [loadingSites, setLoadingSites] = useState(true);
  const [loadingDispatches, setLoadingDispatches] = useState(false);
  const [loadingGuides, setLoadingGuides] = useState(false);
  const [error, setError] = useState('');
  const dispatchAbort = useRef<AbortController | null>(null);
  const guideAbort = useRef<AbortController | null>(null);
  const detailAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    urbanoDispatchService.sites(controller.signal)
      .then((data) => {
        setSites(data);
        const firstAvailable = data.find((site) => site.available);
        if (firstAvailable) setSiteId(String(firstAvailable.id));
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(getApiErrorMessage(requestError, 'No se pudieron cargar las sedes.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSites(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => () => {
    dispatchAbort.current?.abort();
    guideAbort.current?.abort();
    detailAbort.current?.abort();
  }, []);

  const selectedSite = sites.find((site) => String(site.id) === siteId);
  const visibleDispatches = useMemo(() => {
    const query = dispatchFilter.trim().toLocaleLowerCase('es');
    if (!query) return dispatches?.records ?? [];
    return (dispatches?.records ?? []).filter((dispatch) => [
      dispatch.cdp,
      dispatch.destination,
      dispatch.origin,
      dispatch.containerType,
      dispatch.operator,
    ].some((value) => value.toLocaleLowerCase('es').includes(query)));
  }, [dispatchFilter, dispatches]);

  const visibleGuides = useMemo(() => {
    const query = guideFilter.trim().toLocaleLowerCase('es');
    if (!query) return result?.records ?? [];
    return (result?.records ?? []).filter((record) => [
      record.guide,
      record.tracking,
      record.recipient,
      record.destination,
      record.customer,
      record.service,
    ].some((value) => value.toLocaleLowerCase('es').includes(query)));
  }, [guideFilter, result]);

  const loadGuides = async (
    dispatch: UrbanoDispatchSummary,
    selectedSiteId = Number(siteId),
  ) => {
    guideAbort.current?.abort();
    const controller = new AbortController();
    guideAbort.current = controller;
    setSelected(dispatch);
    setLoadingGuides(true);
    setError('');
    detailAbort.current?.abort();
    setExpandedGuide(null);
    setGuideDetails({});
    setDetailErrors({});
    setDetailLoadingGuide(null);
    try {
      const data = await urbanoDispatchService.lookup({
        siteId: selectedSiteId,
        dispatchId: dispatch.id,
        line: dispatch.line,
        page: 1,
        limit: 500,
      }, controller.signal);
      setResult(data);
      setGuideDetails(Object.fromEntries(
        data.records.flatMap((record) => record.detail ? [[record.guide, record.detail]] : []),
      ));
      setGuideFilter('');
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setResult(null);
        setError(getApiErrorMessage(requestError, 'No se pudieron cargar las guías del CDP.'));
      }
    } finally {
      if (!controller.signal.aborted) setLoadingGuides(false);
    }
  };

  const loadDispatches = async () => {
    if (!siteId || !selectedSite?.available) {
      showToast('Selecciona una sede con integración Urbano activa.', 'warning');
      return;
    }
    if (!fromDate || !toDate || fromDate > toDate) {
      showToast('Revisa el rango de fechas.', 'warning');
      return;
    }

    dispatchAbort.current?.abort();
    guideAbort.current?.abort();
    detailAbort.current?.abort();
    const controller = new AbortController();
    dispatchAbort.current = controller;
    setLoadingDispatches(true);
    setSelected(null);
    setResult(null);
    setExpandedGuide(null);
    setGuideDetails({});
    setDetailErrors({});
    setDetailLoadingGuide(null);
    setError('');
    try {
      const data = await urbanoDispatchService.dispatches({
        siteId: Number(siteId),
        fromDate,
        toDate,
      }, controller.signal);
      setDispatches(data);
      setDispatchFilter('');
      if (data.records[0]) void loadGuides(data.records[0], Number(siteId));
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setDispatches(null);
        setError(getApiErrorMessage(requestError, 'No se pudieron consultar los despachos en Urbano.'));
      }
    } finally {
      if (!controller.signal.aborted) setLoadingDispatches(false);
    }
  };

  const changeSite = (nextSiteId: string) => {
    dispatchAbort.current?.abort();
    guideAbort.current?.abort();
    detailAbort.current?.abort();
    setSiteId(nextSiteId);
    setDispatches(null);
    setSelected(null);
    setResult(null);
    setExpandedGuide(null);
    setGuideDetails({});
    setDetailErrors({});
    setDetailLoadingGuide(null);
    setError('');
  };

  const toggleGuideDetails = async (record: UrbanoDispatchGuide) => {
    if (expandedGuide === record.guide && !detailErrors[record.guide]) {
      detailAbort.current?.abort();
      setExpandedGuide(null);
      setDetailLoadingGuide(null);
      return;
    }

    setExpandedGuide(record.guide);
    if (guideDetails[record.guide]) return;

    detailAbort.current?.abort();
    const controller = new AbortController();
    detailAbort.current = controller;
    setDetailLoadingGuide(record.guide);
    setDetailErrors((current) => ({ ...current, [record.guide]: '' }));
    try {
      const detail = await urbanoDispatchService.guideDetails(Number(siteId), record.guide, controller.signal);
      setGuideDetails((current) => ({ ...current, [record.guide]: detail }));
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setDetailErrors((current) => ({
          ...current,
          [record.guide]: getApiErrorMessage(requestError, 'No se pudo cargar la ficha de esta guía.'),
        }));
      }
    } finally {
      if (!controller.signal.aborted) setDetailLoadingGuide(null);
    }
  };

  const renderDetails = (record: UrbanoDispatchGuide) => {
    const detail = guideDetails[record.guide];
    if (detailLoadingGuide === record.guide) {
      return <div className={styles.detailLoading}><RefreshCw className={styles.spin} size={18} /> Consultando datos completos en Urbano…</div>;
    }
    if (!detail) {
      return (
        <div className={styles.detailError}>
          <span>{detailErrors[record.guide] || 'No se encontró información adicional.'}</span>
          <button type="button" onClick={() => void toggleGuideDetails(record)}>Reintentar</button>
        </div>
      );
    }

    const timeline = [
      ['Recojo', detail.dates.pickup],
      ['Despacho', detail.dates.dispatched],
      ['Admisión', detail.dates.admitted],
      ['En reparto', detail.dates.outForDelivery],
      ['Fecha límite', detail.dates.deadline],
    ].filter((entry) => entry[1]);
    const phoneHref = detail.phone.replace(/[^\d+]/g, '');
    return (
      <div className={styles.detailCard}>
        <div className={styles.detailHeader}>
          <div><span>Ficha completa del envío</span><strong>{detail.guide}</strong></div>
          <span className={`${styles.status} ${statusTone(detail.status)}`}>{present(detail.status, 'Sin estado')}</span>
        </div>
        <div className={styles.detailSections}>
          <section>
            <h3>Destinatario</h3>
            <dl>
              <div><dt>Nombre</dt><dd>{present(detail.recipient)}</dd></div>
              <div><dt>Teléfono</dt><dd>{phoneHref ? <a href={`tel:${phoneHref}`}>{detail.phone}</a> : 'No registrado'}</dd></div>
              <div><dt>Correo</dt><dd>{detail.email ? <a href={`mailto:${detail.email}`}>{detail.email}</a> : 'No registrado'}</dd></div>
            </dl>
          </section>
          <section>
            <h3>Entrega</h3>
            <dl>
              <div className={styles.detailWide}><dt>Dirección</dt><dd>{present(detail.address, 'No registrada')}</dd></div>
              <div><dt>Localidad</dt><dd>{present(detail.locality)}</dd></div>
              <div><dt>Ruta</dt><dd>{present(detail.origin)} → {present(detail.destination)}</dd></div>
              <div><dt>Fecha estimada</dt><dd>{present(detail.estimatedDeliveryDate, 'No informada')}</dd></div>
            </dl>
          </section>
          <section>
            <h3>Envío</h3>
            <dl>
              <div><dt>Rastreo</dt><dd>{present(detail.tracking)}</dd></div>
              <div><dt>Piezas</dt><dd>{detail.pieces ?? 'No informado'}</dd></div>
              <div><dt>Peso</dt><dd>{detail.weightKg === null ? 'No informado' : `${detail.weightKg.toFixed(2)} kg`}</dd></div>
              <div><dt>Remitente</dt><dd>{present(detail.sender)}</dd></div>
              <div><dt>Registro Urbano</dt><dd>{present(detail.registeredAt, 'No informado')}</dd></div>
              <div><dt>Contrato</dt><dd>{present(detail.contract)}</dd></div>
              <div><dt>Vendedor</dt><dd>{present(detail.seller)}</dd></div>
              <div className={styles.detailWide}><dt>Servicio</dt><dd>{present(detail.service)}</dd></div>
              <div className={styles.detailWide}><dt>Contenido</dt><dd>{present(detail.contents, 'No declarado')}</dd></div>
            </dl>
          </section>
          <section>
            <h3>Seguimiento</h3>
            <dl>
              <div className={styles.detailWide}><dt>Detalle operativo</dt><dd>{present(detail.statusDetail, 'Sin observaciones')}</dd></div>
              <div><dt>Referencia de pieza</dt><dd>{present(detail.pieceReference)}</dd></div>
              <div><dt>Seguro</dt><dd>{detail.insured === null ? 'No informado' : detail.insured ? `Sí · S/ ${(detail.insuranceValue ?? 0).toFixed(2)}` : 'No'}</dd></div>
              <div><dt>Frágil</dt><dd>{detail.fragile === null ? 'No informado' : detail.fragile ? 'Sí' : 'No'}</dd></div>
              <div><dt>Coordenadas</dt><dd>{detail.latitude === null || detail.longitude === null ? 'No registradas' : `${detail.latitude}, ${detail.longitude}`}</dd></div>
            </dl>
            {timeline.length > 0 && (
              <div className={styles.detailTimeline}>
                {timeline.map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  };

  return (
    <main className={`main ${styles.page}`} id="main-content">
      <PageHeader
        icon={<PackageSearch />}
        title="Despachos Urbano"
        subtitle="Consulta administrativa de CDP y guías"
        tone="corporate"
        metadata={(
          <div className={styles.headerMeta}>
            <span><ShieldCheck size={15} /> Acceso administrador</span>
            <span><i /> Conexión segura</span>
          </div>
        )}
      />

      <div className={styles.content}>
        <section className={styles.queryCard} aria-labelledby="dispatch-query-title">
          <div className={styles.cardHeading}>
            <div>
              <span className={styles.eyebrow}>CONSULTA EN TIEMPO REAL</span>
              <h2 id="dispatch-query-title">Buscar despachos</h2>
              <p>Consulta el rango y selecciona un CDP para ver sus guías.</p>
            </div>
          </div>

          <form className={styles.queryForm} onSubmit={(event) => { event.preventDefault(); void loadDispatches(); }}>
            <label className={styles.siteField}>
              <span>Sede operativa</span>
              <div className={styles.inputShell}>
                <Building2 size={17} />
                <select value={siteId} onChange={(event) => changeSite(event.target.value)} disabled={loadingSites || loadingDispatches} required>
                  <option value="">{loadingSites ? 'Cargando sedes…' : 'Seleccionar sede'}</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id} disabled={!site.available}>
                      {site.name}{site.available ? '' : ' · Sin acceso activo'}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label>
              <span>Desde</span>
              <div className={styles.inputShell}>
                <CalendarDays size={17} />
                <input type="date" value={fromDate} max={toDate} onChange={(event) => setFromDate(event.target.value)} disabled={loadingDispatches} required />
              </div>
            </label>
            <label>
              <span>Hasta</span>
              <div className={styles.inputShell}>
                <CalendarDays size={17} />
                <input type="date" value={toDate} min={fromDate} onChange={(event) => setToDate(event.target.value)} disabled={loadingDispatches} required />
              </div>
            </label>
            <button className={styles.searchButton} type="submit" disabled={loadingDispatches || loadingSites}>
              {loadingDispatches ? <RefreshCw className={styles.spin} size={18} /> : <Search size={18} />}
              {loadingDispatches ? 'Consultando…' : 'Buscar en Urbano'}
            </button>
          </form>
        </section>

        {error && (
          <div className={styles.errorBanner} role="alert">
            <AlertCircle size={20} />
            <div><strong>No se pudo completar la consulta</strong><span>{error}</span></div>
          </div>
        )}

        {dispatches ? (
          <div className={styles.workspace}>
            <aside className={styles.dispatchPanel} aria-label="Despachos disponibles">
              <div className={styles.panelHeader}>
                <div><h2>CDP disponibles</h2><span>{dispatches.total} encontrados</span></div>
                <label className={styles.compactSearch}>
                  <Search size={15} />
                  <input value={dispatchFilter} onChange={(event) => setDispatchFilter(event.target.value)} placeholder="Buscar CDP" />
                </label>
              </div>
              <div className={styles.dispatchList}>
                {visibleDispatches.map((dispatch) => {
                  const admission = admissionState(dispatch);
                  return (
                    <button
                      key={dispatch.id}
                      type="button"
                      className={`${styles.dispatchCard} ${selected?.id === dispatch.id ? styles.dispatchCardActive : ''}`}
                      onClick={() => void loadGuides(dispatch)}
                      disabled={loadingGuides && selected?.id === dispatch.id}
                    >
                      <div className={styles.dispatchTitle}>
                        <strong>{dispatch.cdp}</strong>
                        <span>{present(dispatch.containerType, 'Despacho')}</span>
                      </div>
                      <div className={styles.dispatchRoute}>
                        <MapPin size={14} />
                        <span>{present(dispatch.destination, 'Destino Urbano')}</span>
                        <time>{present(dispatch.dispatchedAt, 'Sin fecha')}</time>
                      </div>
                      <div className={styles.dispatchStats}>
                        <span><b>{dispatch.totalGuides}</b><small>Guías</small></span>
                        <span><b>{dispatch.totalPieces}</b><small>Piezas</small></span>
                        <span><b>{dispatch.totalWeightKg.toFixed(2)}</b><small>Kg</small></span>
                      </div>
                      <div className={`${styles.dispatchAdmission} ${admission.tone}`}>
                        <i /> <span>{admission.label}</span>
                        {dispatch.admittedAt && <time>{dispatch.admittedAt}</time>}
                      </div>
                    </button>
                  );
                })}
                {!visibleDispatches.length && <div className={styles.noDispatches}>No hay CDP para este filtro.</div>}
              </div>
            </aside>

            <section className={styles.resultsCard} aria-labelledby="dispatch-results-title">
              {selected ? (
                <>
                  <div className={styles.resultsHeader}>
                    <div>
                      <span className={styles.eyebrow}>{selected.cdp}</span>
                      <h2 id="dispatch-results-title">Guías del despacho</h2>
                      <p>{dispatches.site.name} · {present(selected.destination, 'Destino Urbano')} · {formatDateTime(dispatches.retrievedAt)}</p>
                    </div>
                    <div className={styles.resultActions}>
                      <label className={styles.filterBox}>
                        <Search size={16} />
                        <input value={guideFilter} onChange={(event) => setGuideFilter(event.target.value)} placeholder="Filtrar guías" />
                      </label>
                      <button type="button" onClick={() => result && downloadDispatchCsv(result, visibleGuides)} disabled={!visibleGuides.length}>
                        <Download size={16} /> CSV
                      </button>
                    </div>
                  </div>

                  <div className={styles.metrics}>
                    <article><span>Total guías</span><strong>{result?.total ?? selected.totalGuides}</strong></article>
                    <article><span>Piezas</span><strong>{selected.totalPieces}</strong></article>
                    <article><span>Peso</span><strong>{selected.totalWeightKg.toFixed(2)} <small>kg</small></strong></article>
                    <article><span>Admisión</span><strong className={styles.metricDate}>{present(selected.admittedAt, 'Pendiente')}</strong></article>
                  </div>

                  <div className={styles.tableWrap} aria-busy={loadingGuides}>
                    {loadingGuides ? (
                      <div className={styles.loadingState}><RefreshCw className={styles.spin} size={24} /><span>Cargando guías…</span></div>
                    ) : (
                      <table>
                        <thead><tr><th>Guía / rastreo</th><th>Destinatario</th><th>Destino</th><th>Cliente / servicio</th><th>Estado</th><th aria-label="Acciones" /></tr></thead>
                        <tbody>
                          {visibleGuides.map((record, index) => (
                            <Fragment key={`${record.id}-${index}`}>
                              <tr>
                                <td><strong className={styles.guide}>{present(record.guide, present(record.tracking))}</strong><span>{present(record.tracking, 'Sin rastreo')}</span></td>
                                <td><strong>{present(record.recipient, 'Sin destinatario')}</strong><span>{present(record.phone, 'Sin teléfono')}</span></td>
                                <td><strong>{present(record.destination, selected.destination)}</strong><span className={styles.clamp}>{present(record.address, 'Sin dirección')}</span></td>
                                <td><strong>{present(record.customer, 'Sin cliente')}</strong><span>{present(record.service, 'Sin servicio')}</span></td>
                                <td><span className={`${styles.status} ${statusTone(record.status)}`}>{guideStatus(record.status)}</span></td>
                                <td><button className={styles.detailsButton} type="button" aria-expanded={expandedGuide === record.guide} onClick={() => void toggleGuideDetails(record)}>Ver ficha <ChevronDown size={15} /></button></td>
                              </tr>
                              {expandedGuide === record.guide && <tr className={styles.detailsRow}><td colSpan={6}>{renderDetails(record)}</td></tr>}
                            </Fragment>
                          ))}
                          {!visibleGuides.length && <tr><td colSpan={6} className={styles.empty}>Este CDP no tiene guías para mostrar.</td></tr>}
                        </tbody>
                      </table>
                    )}
                  </div>

                </>
              ) : (
                <div className={styles.emptyResult}><PackageSearch size={30} /><h2>Selecciona un CDP</h2><p>Las guías aparecerán aquí.</p></div>
              )}
            </section>
          </div>
        ) : (
          <section className={styles.emptyState}>
            <span><PackageSearch size={28} /></span>
            <div><h2>Consulta los despachos de Urbano</h2><p>Selecciona la sede y el rango de fechas.</p></div>
          </section>
        )}
      </div>
    </main>
  );
};
