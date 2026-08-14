import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { CalendarRange, Check, Clock3, FileCheck2, Plus, RefreshCw, Stethoscope, X } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { PageLoader } from '../../../components/ui/PageLoader/PageLoader';
import { getApiErrorMessage } from '../../../core/api/errors';
import { rrhhService } from '../rrhh.service';
import type { AbsenceWorkflows, Employee, PermissionRequest, VacationRequest } from '../types';
import styles from '../Rrhh.module.css';
import { AbsenceRequestModal } from './AbsenceRequestModal';
import { RequestResolutionModal } from './RequestResolutionModal';

type ResolutionTarget = { kind: 'PERMISO'; item: PermissionRequest } | { kind: 'VACACIONES'; item: VacationRequest };
const empty: AbsenceWorkflows = { permissions: [], vacations: [] };
function date(value: string) { const day = value.slice(0, 10); return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${day}T12:00:00-05:00`)); }
function dateTime(value: string) { return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }

export function AbsencePanel({ siteId, employees, canManage }: { siteId: number; employees: Employee[]; canManage: boolean }) {
  const [data, setData] = useState(empty); const [loading, setLoading] = useState(true); const [error, setError] = useState<unknown>(null);
  const [creating, setCreating] = useState(false); const [target, setTarget] = useState<ResolutionTarget | null>(null); const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try { setData(await rrhhService.getAbsenceWorkflows(siteId, signal)); }
    catch (loadError) { if (!axios.isCancel(loadError)) setError(loadError); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [siteId]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const openResolution = (item: ResolutionTarget, nextDecision: 'APPROVE' | 'REJECT') => { setTarget(item); setDecision(nextDecision); };
  const pendingPermissions = data.permissions.filter(item => item.estado === 'PENDIENTE').length;
  const pendingVacations = data.vacations.filter(item => item.estado === 'SOLICITADA').length;
  const approved = data.permissions.filter(item => item.estado === 'APROBADO').length + data.vacations.filter(item => ['APROBADA', 'PROGRAMADA', 'EN_CURSO'].includes(item.estado)).length;

  return <div className={styles.absenceStack}>
    <div className={styles.workflowSummary}><article><span><Clock3 /></span><div><strong>{pendingPermissions + pendingVacations}</strong><p>Pendientes de revisión</p></div></article><article><span><Stethoscope /></span><div><strong>{pendingPermissions}</strong><p>Permisos y justificaciones</p></div></article><article><span><CalendarRange /></span><div><strong>{pendingVacations}</strong><p>Solicitudes de vacaciones</p></div></article><article><span><FileCheck2 /></span><div><strong>{approved}</strong><p>Solicitudes aprobadas</p></div></article></div>
    <article className={styles.card}><header className={styles.toolbar}><div><h2>Permisos, vacaciones y justificaciones</h2><p>Revisa solicitudes y conserva una trazabilidad formal de cada decisión.</p></div><div className={styles.toolbarActions}><Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} loading={loading} onClick={() => void load()}>Actualizar</Button>{canManage && <Button size="sm" icon={<Plus size={15} />} onClick={() => setCreating(true)}>Nueva solicitud</Button>}</div></header>
      {loading && !data.permissions.length && !data.vacations.length ? <PageLoader compact label="Consultando solicitudes" /> : error ? <div className={styles.tableError}><p>{getApiErrorMessage(error, 'No se pudieron consultar las solicitudes.')}</p><Button variant="secondary" size="sm" onClick={() => void load()}>Reintentar</Button></div> : <div className={styles.workflowColumns}>
        <section><header><h3>Permisos y justificaciones</h3><span>{data.permissions.length}</span></header><div className={styles.requestList}>{data.permissions.map(item => <article className={styles.requestCard} key={item.id}><div className={styles.requestTop}><div className={styles.person}><span>{item.nombres.charAt(0)}{item.apellidos.charAt(0)}</span><div><strong>{item.nombres} {item.apellidos}</strong><small>{item.cargo_nombre} · {item.codigo_empleado}</small></div></div><span className={`${styles.requestStatus} ${styles[`request${item.estado}`]}`}>{item.estado === 'PENDIENTE' ? 'Pendiente' : item.estado === 'APROBADO' ? 'Aprobado' : 'Rechazado'}</span></div><div className={styles.requestPeriod}><Stethoscope size={14} /><span>{item.tipo_permiso.toLocaleLowerCase('es')} · {dateTime(item.fecha_inicio)} — {dateTime(item.fecha_fin)}</span></div><p>{item.motivo}</p>{item.comentario_resolucion && <small className={styles.resolutionComment}>Resolución: {item.comentario_resolucion}</small>}{canManage && item.estado === 'PENDIENTE' && <footer><button className={styles.approveAction} onClick={() => openResolution({ kind: 'PERMISO', item }, 'APPROVE')}><Check />Aprobar</button><button className={styles.rejectAction} onClick={() => openResolution({ kind: 'PERMISO', item }, 'REJECT')}><X />Rechazar</button></footer>}</article>)}{!data.permissions.length && <div className={styles.smallEmpty}>No hay permisos registrados.</div>}</div></section>
        <section><header><h3>Vacaciones</h3><span>{data.vacations.length}</span></header><div className={styles.requestList}>{data.vacations.map(item => <article className={styles.requestCard} key={item.id}><div className={styles.requestTop}><div className={styles.person}><span>{item.nombres.charAt(0)}{item.apellidos.charAt(0)}</span><div><strong>{item.nombres} {item.apellidos}</strong><small>{item.cargo_nombre} · {item.codigo_empleado}</small></div></div><span className={`${styles.requestStatus} ${styles[`request${item.estado}`]}`}>{item.estado === 'SOLICITADA' ? 'Pendiente' : item.estado.toLocaleLowerCase('es')}</span></div><div className={styles.requestPeriod}><CalendarRange size={14} /><span>{date(item.fecha_inicio)} — {date(item.fecha_fin)} · {item.dias_tomados} días</span></div><p>{item.motivo || 'Sin comentario adicional.'}</p>{item.comentario_revision && <small className={styles.resolutionComment}>Resolución: {item.comentario_revision}</small>}{canManage && item.estado === 'SOLICITADA' && <footer><button className={styles.approveAction} onClick={() => openResolution({ kind: 'VACACIONES', item }, 'APPROVE')}><Check />Aprobar</button><button className={styles.rejectAction} onClick={() => openResolution({ kind: 'VACACIONES', item }, 'REJECT')}><X />Rechazar</button></footer>}</article>)}{!data.vacations.length && <div className={styles.smallEmpty}>No hay vacaciones registradas.</div>}</div></section>
      </div>}
    </article>
    <AbsenceRequestModal open={creating} siteId={siteId} employees={employees} onClose={() => setCreating(false)} onSaved={() => load()} />
    <RequestResolutionModal siteId={siteId} target={target} decision={decision} onClose={() => setTarget(null)} onSaved={() => load()} />
  </div>;
}
