import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle, ArrowRight, BadgeDollarSign, Banknote, CalendarDays, CheckCircle2, CircleDollarSign,
  ClipboardCheck, Download, Eye, FileCheck2, FileSpreadsheet, History, Landmark, Layers3, LockKeyhole,
  PencilLine, Plus, ReceiptText, RefreshCw, Search, ShieldCheck, WalletCards,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showConfirm, showToast } from '../../../core/utils/toast';
import { rrhhService } from '../rrhh.service';
import type {
  ServicePaymentDashboard, ServicePaymentHistory, ServicePaymentHistoryRow, ServicePaymentQueue,
  ServicePaymentRow, Site,
} from '../types';
import { EmployeePaymentLedgerModal } from './EmployeePaymentLedgerModal';
import { employeePhotoFallbackHandler, getEmployeePhotoUrl } from './employee-avatar';
import {
  agreementFormDefaults, applicationDate, canonicalCurrencyText, parseCurrencyText,
  sanitizeCurrencyText, type AgreementApplicationMode, type AgreementFormDefaults,
} from './payment-agreement-form';
import styles from './PaymentsPanel.module.css';

type PaymentAction = 'agreement' | 'movement' | 'loan' | 'receipt' | 'deposit';
type ModalState = { action: PaymentAction; payment: ServicePaymentRow } | null;
type QueueFilter = 'TODOS' | ServicePaymentQueue;

const money = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 });
const number = (value: number | string) => Number(value || 0);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const readableDate = (value: string) => new Intl.DateTimeFormat('es-PE', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${value}T12:00:00Z`));

const statusLabel: Record<ServicePaymentRow['estado'], string> = {
  PREVISUALIZACION: 'Por preparar', CONFIGURACION_PENDIENTE: 'Falta configurar', BORRADOR: 'Borrador',
  OBSERVADO: 'Observado', LISTO_PARA_PAGO: 'Listo para pagar', EN_REVISION: 'En revisión',
  APROBADO: 'Aprobado', EN_LOTE: 'En lote bancario', PAGADO: 'Pagado',
};

const periodStatusCopy: Record<NonNullable<ServicePaymentDashboard['period']>['estado'], { label: string; next: string; tone: string }> = {
  BORRADOR: { label: 'Mes abierto', next: 'Completa los expedientes y envíalos a revisión.', tone: 'open' },
  EN_REVISION: { label: 'En revisión', next: 'Valida cada expediente y sus Recibos por Honorarios.', tone: 'review' },
  APROBADO: { label: 'Autorizado', next: 'Los expedientes validados pueden agruparse para depósito.', tone: 'ready' },
  EN_PAGO: { label: 'Depósitos en curso', next: 'Confirma las operaciones bancarias realizadas.', tone: 'paying' },
  PAGADO: { label: 'Pagos completados', next: 'Verifica el cierre documental del mes.', tone: 'paid' },
  CERRADO: { label: 'Mes cerrado', next: 'El expediente mensual quedó protegido para auditoría.', tone: 'closed' },
};

const queueMeta: Array<{ key: QueueFilter; label: string; description: string }> = [
  { key: 'TODOS', label: 'Todos', description: 'Expedientes del mes' },
  { key: 'POR_REVISAR', label: 'Por revisar', description: 'Requieren validación' },
  { key: 'OBSERVADOS', label: 'Observados', description: 'Falta información' },
  { key: 'LISTOS_PARA_PAGO', label: 'Listos para pagar', description: 'Aptos para lote' },
  { key: 'EN_PAGO', label: 'En depósito', description: 'Operación bancaria' },
  { key: 'PAGADOS', label: 'Pagados', description: 'Depósito confirmado' },
];

const monthName = (value: string) => {
  const key = value.slice(0, 7);
  const date = new Date(`${key}-01T12:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  const formatted = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};

export function PaymentsPanel({
  month, siteId, sites, canManage, onSiteChange, onMonthChange,
}: {
  month: string;
  siteId: number | null;
  sites: Site[];
  canManage: boolean;
  onSiteChange: (siteId: number | null) => void;
  onMonthChange: (month: string) => void;
}) {
  const [view, setView] = useState<'current' | 'history'>('current');
  const [data, setData] = useState<ServicePaymentDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState('');
  const [queue, setQueue] = useState<QueueFilter>('TODOS');
  const [modal, setModal] = useState<ModalState>(null);
  const [ledgerEmployee, setLedgerEmployee] = useState<ServicePaymentRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try { setData(await rrhhService.getServicePayments(month, siteId, signal)); }
    catch (loadError) { if (!axios.isCancel(loadError)) setError(loadError); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [month, siteId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const payments = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    return (data?.payments ?? []).filter(payment => {
      if (queue !== 'TODOS' && payment.queue !== queue) return false;
      if (!normalized) return true;
      return `${payment.nombres} ${payment.apellidos} ${payment.codigo_empleado} ${payment.dni} ${payment.sede} ${payment.cargo}`
        .toLocaleLowerCase('es').includes(normalized);
    });
  }, [data?.payments, query, queue]);

  const queueCount = (key: QueueFilter) => key === 'TODOS'
    ? data?.summary.collaborators ?? 0
    : data?.summary.queues[key] ?? 0;

  const generate = async () => {
    const confirmed = await showConfirm({
      title: 'Abrir expediente mensual',
      message: 'El sistema preparará una liquidación individual por colaborador usando los acuerdos, horas extras aprobadas y movimientos vigentes.',
      confirmText: 'Abrir mes', type: 'info',
    });
    if (!confirmed) return;
    setSubmitting(true);
    try {
      await rrhhService.generatePaymentPeriod(month);
      await load();
      showToast('El expediente mensual quedó abierto correctamente.', 'success');
    } catch (requestError) { showToast(getApiErrorMessage(requestError, 'No se pudo preparar el periodo.'), 'error'); }
    finally { setSubmitting(false); }
  };

  const runPeriodAction = async (
    title: string,
    message: string,
    confirmText: string,
    operation: () => Promise<unknown>,
  ) => {
    if (!await showConfirm({ title, message, confirmText, type: 'info' })) return;
    setSubmitting(true);
    try { await operation(); await load(); showToast('El ciclo mensual fue actualizado correctamente.', 'success'); }
    catch (requestError) { showToast(getApiErrorMessage(requestError, 'No se pudo actualizar el ciclo mensual.'), 'error'); }
    finally { setSubmitting(false); }
  };

  const period = data?.period;
  const nextPeriodAction = period?.estado === 'BORRADOR'
    ? { label: 'Enviar a revisión', icon: <ArrowRight size={17} />, run: () => rrhhService.transitionPaymentPeriod(period.id, 'ENVIAR_REVISION'), title: 'Enviar periodo a revisión', message: 'Los importes quedarán congelados para su validación administrativa.' }
    : period?.estado === 'EN_REVISION'
      ? { label: 'Aprobar periodo', icon: <ShieldCheck size={17} />, run: () => rrhhService.transitionPaymentPeriod(period.id, 'APROBAR'), title: 'Aprobar pagos mensuales', message: 'Esta aprobación bloqueará el cálculo y habilitará la preparación del lote bancario.' }
      : period?.estado === 'APROBADO'
        ? { label: 'Crear lote bancario', icon: <Layers3 size={17} />, run: () => rrhhService.createPaymentBatch(period.id), title: 'Crear lote de depósitos', message: 'Solo se incluirán liquidaciones aprobadas con RHE y cuenta bancaria validados.' }
        : period?.estado === 'PAGADO'
          ? { label: 'Cerrar periodo', icon: <LockKeyhole size={17} />, run: () => rrhhService.transitionPaymentPeriod(period.id, 'CERRAR'), title: 'Cerrar periodo mensual', message: 'El periodo quedará cerrado para auditoría y ya no admitirá modificaciones.' }
          : null;

  const summary = data?.summary;
  return <section className={styles.workspace} aria-label="Administración de pagos mensuales">
    <header className={styles.hero}>
      <div>
        <span className={styles.eyebrow}>GESTIÓN ADMINISTRATIVA</span>
        <h2>Pagos por servicios</h2>
        <p>Liquidaciones individuales, Recibos por Honorarios y depósitos bancarios.</p>
      </div>
      <div className={styles.heroActions}>
        <nav className={styles.viewSwitch} aria-label="Vista de pagos">
          <button type="button" className={view === 'current' ? styles.activeView : ''} onClick={() => setView('current')}><WalletCards />Mes seleccionado</button>
          <button type="button" className={view === 'history' ? styles.activeView : ''} onClick={() => setView('history')}><History />Historial mensual</button>
        </nav>
        <label className={styles.siteControl}><Landmark size={16} /><select value={siteId ?? 'all'} onChange={event => onSiteChange(event.target.value === 'all' ? null : Number(event.target.value))}><option value="all">Todas las sedes</option>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
        {view === 'current' && <Button className={styles.refreshAction} variant="secondary" icon={<RefreshCw size={16} />} onClick={() => void load()} loading={loading}>Actualizar</Button>}
        {view === 'current' && canManage && !period && <Button className={styles.periodAction} variant="corporate" icon={<WalletCards size={17} />} onClick={() => void generate()} loading={submitting}>Abrir mes</Button>}
        {view === 'current' && canManage && nextPeriodAction && <Button className={styles.workflowAction} variant="corporate" icon={nextPeriodAction.icon} onClick={() => void runPeriodAction(nextPeriodAction.title, nextPeriodAction.message, nextPeriodAction.label, nextPeriodAction.run)} loading={submitting}>{nextPeriodAction.label}</Button>}
      </div>
    </header>

    {view === 'history' ? <PaymentHistoryView
      selectedMonth={month}
      siteId={siteId}
      onOpenMonth={selectedMonth => { onMonthChange(selectedMonth); setView('current'); }}
    /> : <>
    <PaymentPeriodSummary period={period ?? null} batch={data?.batches?.[0] ?? null} summary={summary ?? null} />

    <div className={styles.kpis}>
      <Kpi icon={<BadgeDollarSign />} label="Pago mensual y conceptos" value={money.format(summary?.service_total ?? 0)} detail={`${summary?.collaborators ?? 0} colaboradores`} tone="blue" />
      <Kpi icon={<CalendarDays />} label="Horas extras aprobadas" value={money.format(summary?.overtime_total ?? 0)} detail="Solo solicitudes aprobadas" tone="violet" />
      <Kpi icon={<Banknote />} label="Adelantos y cuotas" value={money.format(summary?.deductions_total ?? 0)} detail="Descuentos del periodo" tone="amber" />
      <Kpi icon={<CircleDollarSign />} label="Total a depositar" value={money.format(summary?.deposit_total ?? 0)} detail={`${summary?.paid ?? 0} pagos realizados`} tone="green" />
    </div>

    <div className={styles.register}>
      <div className={styles.registerHeader}>
        <div><h3>Expedientes de pago</h3><p>Administra cada liquidación y su sustento documental.</p></div>
        <label className={styles.search}><Search aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar colaborador, DNI, código o sede..." /></label>
      </div>
      <nav className={styles.queueNav} aria-label="Bandejas de pagos">
        {queueMeta.map(item => <button
          key={item.key}
          type="button"
          className={queue === item.key ? styles.activeQueue : ''}
          onClick={() => setQueue(item.key)}
          aria-pressed={queue === item.key}
        >
          <span>{item.label}<b>{queueCount(item.key)}</b></span>
          <small>{item.description}</small>
        </button>)}
      </nav>
      {error ? <div className={styles.state}><p>{getApiErrorMessage(error, 'No se pudieron consultar los pagos.')}</p><Button variant="secondary" onClick={() => void load()}>Reintentar</Button></div>
        : loading && !data ? <div className={styles.state}>Preparando información financiera…</div>
        : <div className={styles.tableViewport}><table>
          <thead><tr><th>Colaborador</th><th>Sede</th><th>Horas extra</th><th>Descuentos</th><th>A depositar</th><th>Expediente</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>{payments.map(payment => <tr key={payment.empleado_id}>
            <td><div className={styles.employee}><img src={getEmployeePhotoUrl({ id: payment.empleado_id, sexo: payment.sexo, foto: payment.foto })} onError={employeePhotoFallbackHandler({ id: payment.empleado_id, sexo: payment.sexo, foto: payment.foto })} alt="" /><div><strong>{payment.nombres} {payment.apellidos}</strong><span>{payment.codigo_empleado} · {payment.cargo}</span></div></div></td>
            <td><span className={styles.site}>{payment.sede}</span></td>
            <td><strong className={styles.overtime}>{money.format(number(payment.monto_horas_extra))}</strong><span className={styles.subvalue}>{payment.minutos_horas_extra || 0} min aprobados</span></td>
            <td><strong className={styles.deduction}>{money.format(number(payment.adelantos) + number(payment.cuotas_prestamo) + number(payment.otros_descuentos))}</strong><span className={styles.subvalue}>Adelantos, cuotas y ajustes</span></td>
            <td><strong className={styles.total}>{money.format(number(payment.total_depositar))}</strong></td>
            <td><div className={styles.documentControl}>
              <span className={payment.rhe_numero ? styles.documentReady : styles.documentPending}>{payment.rhe_numero ? <FileCheck2 /> : <ReceiptText />}{payment.rhe_numero ? `${payment.rhe_serie}-${payment.rhe_numero}` : 'RHE pendiente'}</span>
              <small>{payment.numero_cuenta_ultimos4 ? `${payment.banco} · •••• ${payment.numero_cuenta_ultimos4}` : 'Cuenta bancaria pendiente'}</small>
            </div></td>
            <td><div className={styles.statusCell}>
              <span className={`${styles.status} ${styles[`status_${payment.estado}`]}`}><i />{statusLabel[payment.estado]}</span>
              <small>{paymentControlCopy(payment)}</small>
            </div></td>
            <td><div className={styles.actions}>
              <Action title="Ver expediente mensual" icon={<Eye />} onClick={() => setLedgerEmployee(payment)} />
              {canManage && <Action title="Configurar pago y cuenta" icon={<PencilLine />} onClick={() => setModal({ action: 'agreement', payment })} />}
              {canManage && <Action title="Registrar adelanto o ajuste" icon={<Plus />} onClick={() => setModal({ action: 'movement', payment })} />}
              {canManage && <Action title="Registrar préstamo" icon={<Landmark />} onClick={() => setModal({ action: 'loan', payment })} />}
              {canManage && payment.id && ['EN_REVISION', 'APROBADO'].includes(payment.estado) && <Action title="Registrar Recibo por Honorarios" icon={<ReceiptText />} onClick={() => setModal({ action: 'receipt', payment })} />}
              {canManage && payment.id && payment.rhe_numero && payment.estado === 'EN_LOTE' && <Action title="Confirmar depósito" icon={<CheckCircle2 />} onClick={() => setModal({ action: 'deposit', payment })} />}
            </div></td>
          </tr>)}</tbody>
        </table>{payments.length === 0 && <div className={styles.state}><ClipboardCheck /><strong>Sin expedientes en esta bandeja</strong><span>Ajusta la búsqueda o selecciona otro estado.</span></div>}</div>}
      <footer className={styles.registerFooter}><span>{payments.length} expedientes visibles</span><span>{data?.period ? `${monthName(data.month)} · ${periodStatusCopy[data.period.estado].label}` : `${monthName(data?.month ?? month)} · Vista previa`}</span></footer>
    </div>
    <PaymentForm modal={modal} month={month} submitting={submitting} onClose={() => setModal(null)} onSubmit={async operation => {
      setSubmitting(true);
      try { await operation(); setModal(null); await load(); showToast('La información de pago fue actualizada.', 'success'); }
      catch (requestError) { showToast(getApiErrorMessage(requestError, 'No se pudo guardar la información.'), 'error'); }
      finally { setSubmitting(false); }
    }} />
    <EmployeePaymentLedgerModal employee={ledgerEmployee} month={month} canManage={canManage} onClose={() => setLedgerEmployee(null)} />
    </>}
  </section>;
}

type HistoryStatus = 'TODOS' | ServicePaymentHistoryRow['estado'];

function PaymentHistoryView({
  selectedMonth, siteId, onOpenMonth,
}: {
  selectedMonth: string;
  siteId: number | null;
  onOpenMonth: (month: string) => void;
}) {
  const [year, setYear] = useState(Number(selectedMonth.slice(0, 4)));
  const [status, setStatus] = useState<HistoryStatus>('TODOS');
  const [history, setHistory] = useState<ServicePaymentHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const loadHistory = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try { setHistory(await rrhhService.getServicePaymentHistory(year, siteId, signal)); }
    catch (loadError) { if (!axios.isCancel(loadError)) setError(loadError); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [siteId, year]);

  useEffect(() => {
    const controller = new AbortController();
    void loadHistory(controller.signal);
    return () => controller.abort();
  }, [loadHistory]);

  const periods = useMemo(() => (history?.periods ?? []).filter(period => (
    status === 'TODOS' || period.estado === status
  )), [history?.periods, status]);

  const exportHistory = () => {
    const rows = periods.map(period => [
      monthName(period.month), period.estado, period.collaborators, number(period.service_total),
      number(period.overtime_total), number(period.deductions_total), number(period.deposit_total),
      number(period.paid_total), number(period.pending_total), period.receipts_registered,
    ]);
    const csv = [
      ['Periodo', 'Estado', 'Colaboradores', 'Honorarios', 'Horas extra', 'Descuentos', 'A depositar', 'Depositado', 'Pendiente', 'RHE registrados'],
      ...rows,
    ].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Historial_Pagos_${year}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const summary = history?.summary;
  const years = history?.available_years?.length ? history.available_years : [year];
  return <section className={styles.historyWorkspace} aria-label="Historial de pagos mensuales">
    <header className={styles.historyHeader}>
      <div><span className={styles.eyebrow}>ARCHIVO FINANCIERO</span><h3>Historial mensual de pagos</h3><p>Consulta periodos cerrados o en proceso sin alterar sus importes originales.</p></div>
      <div className={styles.historyFilters}>
        <label><CalendarDays /><span>Año</span><select value={year} onChange={event => setYear(Number(event.target.value))}>{years.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><ClipboardCheck /><span>Estado</span><select value={status} onChange={event => setStatus(event.target.value as HistoryStatus)}><option value="TODOS">Todos</option><option value="BORRADOR">Mes abierto</option><option value="EN_REVISION">En revisión</option><option value="APROBADO">Aprobado</option><option value="EN_PAGO">En depósito</option><option value="PAGADO">Pagado</option><option value="CERRADO">Cerrado</option></select></label>
        <Button variant="secondary" icon={<RefreshCw />} onClick={() => void loadHistory()} loading={loading}>Actualizar</Button>
        <Button variant="corporate" icon={<Download />} onClick={exportHistory} disabled={periods.length === 0}>Exportar historial</Button>
      </div>
    </header>

    <div className={styles.historyKpis}>
      <HistoryKpi label="Periodos registrados" value={String(summary?.periods ?? 0)} detail={`${summary?.closed ?? 0} cerrados para auditoría`} tone="blue" />
      <HistoryKpi label="Total programado" value={money.format(summary?.deposit_total ?? 0)} detail={`Acumulado de ${year}`} tone="navy" />
      <HistoryKpi label="Depósitos confirmados" value={money.format(summary?.paid_total ?? 0)} detail="Operaciones bancarias registradas" tone="green" />
      <HistoryKpi label="Saldo pendiente" value={money.format(summary?.pending_total ?? 0)} detail="Pendiente de confirmación bancaria" tone="amber" />
    </div>

    <div className={styles.historyRegister}>
      <div className={styles.historyTitle}><div><FileSpreadsheet /><span><strong>Periodos de {year}</strong><small>{siteId ? 'Sede seleccionada' : 'Consolidado de toda la empresa'}</small></span></div><b>{periods.length} meses</b></div>
      {error ? <div className={styles.state}><p>{getApiErrorMessage(error, 'No se pudo consultar el historial mensual.')}</p><Button variant="secondary" onClick={() => void loadHistory()}>Reintentar</Button></div>
        : loading && !history ? <div className={styles.state}>Consultando archivo financiero…</div>
          : periods.length === 0 ? <div className={styles.historyEmpty}><History /><strong>No hay periodos para este filtro</strong><span>Los meses aparecerán cuando se abra su expediente mensual.</span></div>
            : <div className={styles.historyTable}><table><thead><tr><th>Periodo</th><th>Estado</th><th>Colaboradores</th><th>Total del mes</th><th>Depositado</th><th>Pendiente</th><th>Control documental</th><th>Acción</th></tr></thead><tbody>{periods.map(period => {
              const state = periodStatusCopy[period.estado];
              return <tr key={period.id}>
                <td><strong>{monthName(period.month)}</strong><span>Actualizado {formatHistoryDate(period.updated_at)}</span></td>
                <td><span className={`${styles.historyStatus} ${styles[`period_${state.tone}`]}`}><i />{state.label}</span></td>
                <td><strong>{period.collaborators}</strong><span>{period.paid_collaborators} pagos confirmados</span></td>
                <td><strong>{money.format(number(period.deposit_total))}</strong><span>{money.format(number(period.overtime_total))} en horas extra</span></td>
                <td><strong className={styles.historyPaid}>{money.format(number(period.paid_total))}</strong></td>
                <td><strong className={number(period.pending_total) > 0 ? styles.historyPending : styles.historyPaid}>{money.format(number(period.pending_total))}</strong></td>
                <td><strong>{period.receipts_registered} de {period.collaborators} RHE</strong><span>{period.observed_collaborators} expedientes observados</span></td>
                <td><button type="button" className={styles.openPeriod} onClick={() => onOpenMonth(period.month)}><Eye />Abrir mes<ArrowRight /></button></td>
              </tr>;
            })}</tbody></table></div>}
    </div>
  </section>;
}

function HistoryKpi({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return <article className={`${styles.historyKpi} ${styles[`history_${tone}`]}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function formatHistoryDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'sin fecha' : new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function Kpi({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: string }) {
  return <article className={styles.kpi}><span className={`${styles.kpiIcon} ${styles[tone]}`}>{icon}</span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}

function PaymentPeriodSummary({ period, batch, summary }: {
  period: ServicePaymentDashboard['period'];
  batch: ServicePaymentDashboard['batches'][number] | null;
  summary: ServicePaymentDashboard['summary'] | null;
}) {
  const control = period ? periodStatusCopy[period.estado] : null;
  const confirmed = number(batch?.pagos_confirmados ?? 0);
  const paymentCount = number(batch?.cantidad_pagos ?? 0);
  const depositProgress = paymentCount > 0 ? Math.min(100, Math.round((confirmed / paymentCount) * 100)) : 0;
  return <section className={styles.periodDesk} aria-label="Situación del mes de pago">
    <div className={styles.periodIdentity}>
      <span className={styles.periodIcon}>{period ? <WalletCards /> : <AlertTriangle />}</span>
      <div><small>EXPEDIENTE MENSUAL</small><strong>{monthName(period?.periodo ?? '') || 'Mes seleccionado'}</strong><p>{control?.next ?? 'Abre el mes para consolidar las liquidaciones individuales.'}</p></div>
    </div>
    <div className={`${styles.periodBadge} ${control ? styles[`period_${control.tone}`] : ''}`}><i />{control?.label ?? 'Vista previa'}</div>
    <dl className={styles.periodMetrics}>
      <div><dt>Expedientes</dt><dd>{summary?.collaborators ?? 0}</dd></div>
      <div><dt>Observados</dt><dd>{summary?.queues.OBSERVADOS ?? 0}</dd></div>
      <div><dt>Listos</dt><dd>{summary?.queues.LISTOS_PARA_PAGO ?? 0}</dd></div>
      <div><dt>Total del mes</dt><dd>{money.format(summary?.deposit_total ?? 0)}</dd></div>
    </dl>
    {batch && <aside className={styles.batchControl}>
      <div><Layers3 /><span><small>Depósitos confirmados</small><strong>{confirmed} de {paymentCount}</strong></span><b>{depositProgress}%</b></div>
      <span className={styles.depositProgress}><i style={{ width: `${depositProgress}%` }} /></span>
    </aside>}
  </section>;
}

function paymentControlCopy(payment: ServicePaymentRow) {
  if (payment.controls.payment_completed) return 'Depósito confirmado';
  if (payment.controls.pending_for_review.length) {
    const count = payment.controls.pending_for_review.length;
    return `${count} ${count === 1 ? 'control pendiente' : 'controles pendientes'}`;
  }
  if (payment.controls.ready_for_batch) return 'Expediente completo';
  if (payment.controls.pending_for_batch.includes('HONOR_RECEIPT')) return 'Falta Recibo por Honorarios';
  return 'Apto para revisión';
}

function Action({ title, icon, onClick }: { title: string; icon: ReactNode; onClick: () => void }) {
  return <button type="button" title={title} aria-label={title} onClick={onClick}>{icon}</button>;
}

function PaymentForm({ modal, month, submitting, onClose, onSubmit }: { modal: ModalState; month: string; submitting: boolean; onClose: () => void; onSubmit: (operation: () => Promise<unknown>) => Promise<void> }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [defaults, setDefaults] = useState<AgreementFormDefaults | null>(null);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!modal) return;
    setFormError('');
    if (modal.action === 'agreement') {
      const agreement = agreementFormDefaults(modal.payment, today());
      setDefaults(agreement);
      setForm({ agreement_id: agreement.agreementId, application_mode: 'CURRENT', monthly_payment: agreement.monthlyPayment,
        proration_policy: agreement.prorationPolicy, overtime_hourly_rate: agreement.overtimeHourlyRate,
        bank: agreement.bank, account_type: agreement.accountType, account_number: '', cci: '', effective_from: agreement.effectiveFrom });
      return;
    }
    setDefaults(null);
    setForm(modal.action === 'movement' ? { type: 'ADELANTO', concept: '', amount: '' }
      : modal.action === 'loan' ? { concept: '', total_amount: '', monthly_installment: '', start_month: month }
        : modal.action === 'receipt' ? { series: 'E001', number: '', issued_at: today(), amount: String(modal.payment.total_servicio || '') } : { operation_number: '' });
  }, [modal, month]);

  if (!modal) return null;
  const payment = modal.payment;
  const names: Record<PaymentAction, [string, string, ReactNode]> = {
    agreement: ['Configurar pago', 'Honorario, sobretiempo y depósito.', <WalletCards key="agreement" />],
    movement: ['Movimiento del periodo', 'Registra adelantos u otros conceptos antes de recalcular el borrador.', <Banknote key="movement" />],
    loan: ['Préstamo al colaborador', 'Define el monto entregado y la cuota mensual que se descontará.', <Landmark key="loan" />],
    receipt: ['Recibo por Honorarios', 'Vincula el comprobante emitido con esta liquidación mensual.', <FileCheck2 key="receipt" />],
    deposit: ['Confirmar depósito', 'Registra la operación bancaria y cierra el pago del colaborador.', <CheckCircle2 key="deposit" />],
  };
  const update = (key: string, value: string) => { setFormError(''); setForm(current => ({ ...current, [key]: value })); };
  const updateEffectiveDate = (value: string) => {
    setFormError('');
    setForm(current => ({ ...current, application_mode: 'CUSTOM', effective_from: value }));
  };
  const selectApplicationMode = (mode: AgreementApplicationMode) => {
    if (!defaults) return;
    setFormError('');
    setForm(current => ({ ...current, application_mode: mode, effective_from: applicationDate(mode, defaults) }));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (modal.action === 'agreement') {
      const monthlyPayment = parseCurrencyText(form.monthly_payment);
      const overtimeRate = parseCurrencyText(form.overtime_hourly_rate);
      const accountNumber = String(form.account_number ?? '').replace(/\s+/g, '');
      const cci = String(form.cci ?? '').replace(/\s+/g, '');
      if (monthlyPayment === null || monthlyPayment <= 0 || monthlyPayment > 9_999_999.99) { setFormError('Ingresa un pago mensual mayor a cero. Ejemplo: 1200 o 1200,00.'); return; }
      if (overtimeRate === null || overtimeRate < 0 || overtimeRate > 9_999_999.99) { setFormError('La tarifa por hora extra debe ser un importe válido, igual o mayor a cero.'); return; }
      if (accountNumber && !/^\d{6,30}$/.test(accountNumber)) { setFormError('El número de cuenta debe contener entre 6 y 30 dígitos.'); return; }
      if (cci && !/^\d{20}$/.test(cci)) { setFormError('El CCI debe contener exactamente 20 dígitos.'); return; }
      if ((accountNumber || cci) && !String(form.bank ?? '').trim()) { setFormError('Indica la entidad bancaria antes de registrar una cuenta o CCI.'); return; }
      const effectiveFrom = form.effective_from ?? '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) { setFormError('Selecciona una fecha exacta para iniciar la vigencia.'); return; }
      void onSubmit(() => rrhhService.savePaymentAgreement(payment.empleado_id, {
        agreement_id: form.agreement_id ? Number(form.agreement_id) : null, monthly_payment: monthlyPayment,
        overtime_hourly_rate: overtimeRate, proration_policy: form.proration_policy, bank: String(form.bank ?? '').trim(),
        account_type: form.account_type, account_number: accountNumber, cci, effective_from: effectiveFrom,
        month: effectiveFrom.slice(0, 7),
      }));
      return;
    }
    const operations: Record<Exclude<PaymentAction, 'agreement'>, () => Promise<unknown>> = {
      movement: () => rrhhService.createPaymentMovement({ employee_id: payment.empleado_id, month, ...form }),
      loan: () => rrhhService.createEmployeeLoan({ employee_id: payment.empleado_id, ...form }),
      receipt: () => rrhhService.registerHonorReceipt(Number(payment.id), { series: form.series ?? '', number: form.number ?? '', issued_at: form.issued_at ?? '', amount: Number(form.amount) }),
      deposit: () => rrhhService.markServicePaymentPaid(Number(payment.id), form.operation_number ?? ''),
    };
    void onSubmit(operations[modal.action]);
  };
  const previewMonthlyPayment = parseCurrencyText(form.monthly_payment);
  const currentMode = (form.application_mode ?? 'CURRENT') as AgreementApplicationMode;
  const isMidMonthChange = /^\d{4}-\d{2}-(?!01)\d{2}$/.test(form.effective_from ?? '');

  return <Modal open title={names[modal.action][0]} description={names[modal.action][1]} icon={names[modal.action][2]} onClose={onClose} maxWidth={modal.action === 'agreement' ? 680 : 740} className={modal.action === 'agreement' ? styles.agreementDialog : ''} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="payment-form" variant="corporate" loading={submitting}>{modal.action === 'agreement' ? 'Guardar cambios' : 'Guardar'}</Button></>}>
    <div className={styles.modalEmployee}><strong>{payment.nombres} {payment.apellidos}</strong><span>{payment.codigo_empleado} · {payment.sede}</span></div>
    <form id="payment-form" className={styles.form} onSubmit={submit} noValidate>
      {formError && <div className={styles.formError} role="alert"><AlertTriangle aria-hidden="true" /><div><strong>Revisa la información</strong><span>{formError}</span></div></div>}
      {modal.action === 'agreement' && <>
        <FormSection number="01" title="Honorarios" detail="Montos en soles" />
        <Field label="Pago mensual" required><CurrencyInput autoFocus value={form.monthly_payment ?? ''} onChange={value => update('monthly_payment', value)} /></Field>
        <Field label="Tarifa por hora extra" required><CurrencyInput value={form.overtime_hourly_rate ?? ''} onChange={value => update('overtime_hourly_rate', value)} /></Field>
        <div className={styles.amountConfirmation} aria-live="polite"><span>Monto confirmado</span><strong>{previewMonthlyPayment !== null && previewMonthlyPayment > 0 ? money.format(previewMonthlyPayment) : '—'}</strong></div>
        <Field label="Pago en mes parcial" wide required><select value={form.proration_policy ?? 'DIAS_CALENDARIO'} onChange={e => update('proration_policy', e.target.value)}><option value="DIAS_CALENDARIO">Prorrateo diario</option><option value="HONORARIO_COMPLETO">Honorario completo</option></select></Field>
        <FormSection number="02" title="Cuenta bancaria" detail="Opcional hasta la revisión" />
        <Field label="Banco"><input value={form.bank ?? ''} onChange={e => update('bank', e.target.value)} placeholder="Entidad bancaria" /></Field>
        <Field label="Tipo de cuenta"><select value={form.account_type ?? 'AHORROS'} onChange={e => update('account_type', e.target.value)}><option value="AHORROS">Ahorros</option><option value="CORRIENTE">Corriente</option></select></Field>
        <Field label="Número de cuenta"><input inputMode="numeric" value={form.account_number ?? ''} onChange={e => update('account_number', e.target.value.replace(/\D/g, '').slice(0, 30))} placeholder={(payment.acuerdo_actual_numero_cuenta_ultimos4 ?? payment.numero_cuenta_ultimos4) ? `Registrada •••• ${payment.acuerdo_actual_numero_cuenta_ultimos4 ?? payment.numero_cuenta_ultimos4}` : 'Número de cuenta'} /></Field>
        <Field label="CCI"><input inputMode="numeric" maxLength={20} value={form.cci ?? ''} onChange={e => update('cci', e.target.value.replace(/\D/g, '').slice(0, 20))} placeholder={(payment.acuerdo_actual_cci_ultimos4 ?? payment.cci_ultimos4) ? `Registrado •••• ${payment.acuerdo_actual_cci_ultimos4 ?? payment.cci_ultimos4}` : '20 dígitos'} /></Field>
        <FormSection number="03" title="Vigencia" detail="Fecha efectiva del cambio" />
        <div className={styles.applicationChoices} role="radiogroup" aria-label="Vigencia del acuerdo">
          <ApplicationChoice active={currentMode === 'CURRENT'} icon={<CalendarDays />} title={defaults?.agreementId ? 'Vigencia actual' : 'Este mes'} date={defaults?.effectiveFrom ?? today()} onClick={() => selectApplicationMode('CURRENT')} />
          <ApplicationChoice active={currentMode === 'NEXT_MONTH'} icon={<History />} title="Próximo mes" date={defaults?.nextMonthEffectiveFrom ?? today()} onClick={() => selectApplicationMode('NEXT_MONTH')} />
        </div>
        <Field label="Aplicar desde" wide required><input type="date" value={form.effective_from ?? ''} onChange={event => updateEffectiveDate(event.target.value)} /></Field>
        {isMidMonthChange && <p className={styles.effectiveNotice}><CalendarDays aria-hidden="true" /><span>Se calculará proporcionalmente desde esta fecha.</span></p>}
      </>}
      {modal.action === 'movement' && <><Field label="Tipo de movimiento" required><select value={form.type ?? 'ADELANTO'} onChange={e => update('type', e.target.value)}><option value="ADELANTO">Adelanto</option><option value="OTRO_INGRESO">Otro ingreso</option><option value="OTRO_DESCUENTO">Otro descuento</option></select></Field><Field label="Monto" required><input type="number" min="0.01" step="0.01" value={form.amount ?? ''} onChange={e => update('amount', e.target.value)} /></Field><Field label="Concepto" wide required><input value={form.concept ?? ''} onChange={e => update('concept', e.target.value)} placeholder="Motivo o referencia del movimiento" /></Field></>}
      {modal.action === 'loan' && <><Field label="Monto entregado" required><input type="number" min="0.01" step="0.01" value={form.total_amount ?? ''} onChange={e => update('total_amount', e.target.value)} /></Field><Field label="Cuota mensual" required><input type="number" min="0.01" step="0.01" value={form.monthly_installment ?? ''} onChange={e => update('monthly_installment', e.target.value)} /></Field><Field label="Primera cuota" required><input type="month" value={form.start_month ?? month} onChange={e => update('start_month', e.target.value)} /></Field><Field label="Concepto" required><input value={form.concept ?? ''} onChange={e => update('concept', e.target.value)} placeholder="Descripción del préstamo" /></Field></>}
      {modal.action === 'receipt' && <><Field label="Serie" required><input value={form.series ?? ''} maxLength={8} onChange={e => update('series', e.target.value)} /></Field><Field label="Número" required><input value={form.number ?? ''} maxLength={20} onChange={e => update('number', e.target.value)} /></Field><Field label="Fecha de emisión" required><input type="date" value={form.issued_at ?? ''} onChange={e => update('issued_at', e.target.value)} /></Field><Field label="Importe bruto del RHE" required><input type="number" min="0.01" step="0.01" value={form.amount ?? ''} onChange={e => update('amount', e.target.value)} /></Field><p className={styles.formNote}>Importe aprobado: <strong>{money.format(number(payment.total_servicio))}</strong>. El RHE debe coincidir antes de crear el lote bancario.</p></>}
      {modal.action === 'deposit' && <><div className={styles.depositSummary}><span>Total a depositar</span><strong>{money.format(number(payment.total_depositar))}</strong><small>{payment.banco} · cuenta •••• {payment.numero_cuenta_ultimos4}</small></div><Field label="Número de operación bancaria" wide required><input value={form.operation_number ?? ''} onChange={e => update('operation_number', e.target.value)} placeholder="Código o referencia del depósito" /></Field></>}
    </form>
  </Modal>;
}

function Field({ label, children, required, wide }: { label: string; children: ReactNode; required?: boolean; wide?: boolean }) {
  return <label className={wide ? styles.fieldWide : styles.field}><span>{label}{required && <b> *</b>}</span>{children}</label>;
}

function CurrencyInput({ value, onChange, autoFocus = false }: { value: string; onChange: (value: string) => void; autoFocus?: boolean }) {
  return <div className={styles.currencyInput}><span aria-hidden="true">S/</span><input autoFocus={autoFocus} type="text" inputMode="decimal" autoComplete="off" value={value} onChange={event => onChange(sanitizeCurrencyText(event.target.value))} onBlur={event => onChange(canonicalCurrencyText(event.target.value))} placeholder="0.00" /></div>;
}

function FormSection({ number: sectionNumber, title, detail }: { number: string; title: string; detail: string }) {
  return <div className={styles.formSectionHeading}><span>{sectionNumber}</span><div><strong>{title}</strong><small>{detail}</small></div></div>;
}

function ApplicationChoice({ active, icon, title, date, onClick }: { active: boolean; icon: ReactNode; title: string; date: string; onClick: () => void }) {
  return <button type="button" role="radio" aria-checked={active} className={active ? styles.applicationActive : ''} onClick={onClick}><span className={styles.applicationIcon}>{icon}</span><span><strong>{title}</strong><small>{readableDate(date)}</small></span></button>;
}
