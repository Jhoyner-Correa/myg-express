import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Banknote, CalendarDays, CheckCircle2, CircleAlert, Clock3, FileText,
  Landmark, NotebookPen, ReceiptText, ShieldCheck, Trash2, UserRound, WalletCards,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { rrhhService } from '../rrhh.service';
import type { ServicePaymentEmployeeLedger, ServicePaymentRow } from '../types';
import { employeePhotoFallbackHandler, getEmployeePhotoUrl } from './employee-avatar';
import styles from './EmployeePaymentLedgerModal.module.css';

type Props = {
  employee: ServicePaymentRow | null;
  month: string;
  canManage: boolean;
  onClose: () => void;
};

const currency = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 });
const shortDate = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Lima' });
const dateTime = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' });
const monthTitle = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const week = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

const statusNames: Record<string, string> = {
  PRESENTE: 'Asistió', TARDANZA: 'Tardanza', FALTA: 'Falta', PERMISO: 'Permiso',
  VACACIONES: 'Vacaciones', NO_LABORABLE: 'No laborable', DESCANSO: 'Descanso',
};

const liquidationNames: Record<string, string> = {
  CONFIGURACION_PENDIENTE: 'Falta configurar', BORRADOR: 'Borrador', OBSERVADO: 'Observado',
  LISTO_PARA_PAGO: 'Listo para pagar', EN_REVISION: 'En revisión', APROBADO: 'Aprobado',
  EN_LOTE: 'En lote bancario', PAGADO: 'Pagado', PREVISUALIZACION: 'Vista previa',
};

function amount(value: number | string | null | undefined) {
  return currency.format(Number(value || 0));
}

function parseDate(value: string) {
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00-05:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string | null | undefined, includeTime = false) {
  if (!value) return '—';
  const parsed = parseDate(value);
  if (!parsed) return '—';
  return includeTime ? dateTime.format(parsed) : shortDate.format(parsed);
}

function duration(minutes: number) {
  if (!minutes) return '0 min';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function calendarCells(month: string) {
  const parts = month.split('-').map(Number);
  const year = parts[0] ?? new Date().getUTCFullYear();
  const monthNumber = parts[1] ?? 1;
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const sundayOffset = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  return [...Array.from<null>({ length: sundayOffset }).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
}

function dayKey(month: string, day: number) {
  return `${month}-${String(day).padStart(2, '0')}`;
}

export function EmployeePaymentLedgerModal({ employee, month, canManage, onClose }: Props) {
  const [ledger, setLedger] = useState<ServicePaymentEmployeeLedger | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState('');
  const [referenceAmount, setReferenceAmount] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [cancelNoteId, setCancelNoteId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!employee) return;
    setLoading(true);
    setError(null);
    try { setLedger(await rrhhService.getEmployeePaymentLedger(employee.empleado_id, month, signal)); }
    catch (requestError) { if (!axios.isCancel(requestError)) setError(requestError); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [employee, month]);

  useEffect(() => {
    if (!employee) { setLedger(null); return; }
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [employee, load]);

  useEffect(() => {
    setNote('');
    setReferenceAmount('');
    setCancelNoteId(null);
    setCancelReason('');
  }, [employee?.empleado_id, month]);

  const attendanceByDate = useMemo(() => new Map((ledger?.attendance ?? []).map(record => [record.fecha, record])), [ledger?.attendance]);
  const cells = useMemo(() => calendarCells(month), [month]);
  const liquidation = ledger?.liquidation;
  const paymentPreview = ledger?.payment_preview;
  const deductions = Number(liquidation?.adelantos || 0) + Number(liquidation?.cuotas_prestamo || 0) + Number(liquidation?.otros_descuentos || 0);
  const agreedMonthlyPayment = liquidation?.honorario_mensual_pactado
    ?? paymentPreview?.agreedMonthlyPayment ?? ledger?.employee.pago_mensual;
  const appliedMonthlyPayment = liquidation?.pago_mensual
    ?? paymentPreview?.appliedMonthlyPayment ?? ledger?.employee.pago_mensual;
  const partialPeriod = liquidation ? Number(liquidation.dias_servicio) < Number(liquidation.dias_periodo)
    : Boolean(paymentPreview?.partialPeriod);
  const prorated = liquidation ? Boolean(Number(liquidation.prorrateo_aplicado)) : Boolean(paymentPreview?.prorated);
  const serviceDays = liquidation?.dias_servicio ?? paymentPreview?.serviceDays ?? 0;
  const periodDays = liquidation?.dias_periodo ?? paymentPreview?.periodDays ?? 0;
  const serviceStart = liquidation?.fecha_servicio_desde ?? paymentPreview?.serviceStart;
  const serviceEnd = liquidation?.fecha_servicio_hasta ?? paymentPreview?.serviceEnd;

  const submitNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!employee || note.trim().length < 3) return;
    setSavingNote(true);
    try {
      await rrhhService.addEmployeePaymentNote(employee.empleado_id, {
        month,
        note: note.trim(),
        reference_amount: referenceAmount === '' ? null : Number(referenceAmount),
      });
      setNote(''); setReferenceAmount('');
      await load();
      showToast('La nota quedó registrada en el expediente mensual.', 'success');
    } catch (requestError) { showToast(getApiErrorMessage(requestError, 'No se pudo registrar la nota.'), 'error'); }
    finally { setSavingNote(false); }
  };

  const cancelNote = async () => {
    if (!cancelNoteId || cancelReason.trim().length < 3) return;
    setSavingNote(true);
    try {
      await rrhhService.cancelEmployeePaymentNote(cancelNoteId, cancelReason.trim());
      setCancelNoteId(null); setCancelReason('');
      await load();
      showToast('La nota fue anulada y permanece disponible para auditoría.', 'success');
    } catch (requestError) { showToast(getApiErrorMessage(requestError, 'No se pudo anular la nota.'), 'error'); }
    finally { setSavingNote(false); }
  };

  const fallbackEmployee = employee ? {
    id: employee.empleado_id, sexo: employee.sexo, foto: employee.foto,
  } : null;

  return <Modal
    open={Boolean(employee)}
    title="Expediente mensual del colaborador"
    description="Asistencia, honorarios y trazabilidad del periodo en una sola vista."
    icon={<WalletCards />}
    iconVariant="plain"
    maxWidth={1120}
    className={styles.modal}
    onClose={onClose}
    footer={<Button variant="secondary" onClick={onClose}>Cerrar expediente</Button>}
  >
    {error ? <div className={styles.feedback}><CircleAlert /><strong>No se pudo abrir el expediente</strong><span>{getApiErrorMessage(error, 'Intenta nuevamente.')}</span><Button variant="secondary" onClick={() => void load()}>Reintentar</Button></div>
      : loading && !ledger ? <div className={styles.loading}><span /><p>Consolidando información del periodo…</p></div>
        : ledger && fallbackEmployee ? <div className={styles.content}>
          <section className={styles.identity}>
            <img src={getEmployeePhotoUrl(fallbackEmployee)} onError={employeePhotoFallbackHandler(fallbackEmployee)} alt="" />
            <div className={styles.identityMain}>
              <span>EXPEDIENTE · {ledger.employee.codigo_empleado}</span>
              <h3>{ledger.employee.nombres} {ledger.employee.apellidos}</h3>
              <p>{ledger.employee.cargo} · {ledger.employee.sede}</p>
            </div>
            <div className={styles.identityMeta}>
              <span>Periodo evaluado</span>
              <strong>{monthTitle.format(new Date(`${month}-01T00:00:00Z`))}</strong>
              <small>Ingreso: {formatDate(ledger.employee.fecha_ingreso)}</small>
            </div>
          </section>

          <section className={styles.amountStrip} aria-label="Resumen económico del colaborador">
            <Metric label="Pago mensual aplicado" value={amount(appliedMonthlyPayment)} icon={<WalletCards />} />
            <Metric label="Horas extra aprobadas" value={amount(liquidation?.monto_horas_extra)} detail={duration(ledger.attendance_summary.overtime_minutes)} icon={<Clock3 />} tone="violet" />
            <Metric label="Otros ingresos" value={amount(liquidation?.otros_ingresos)} icon={<Banknote />} tone="blue" />
            <Metric label="Adelantos y cuotas" value={amount(deductions)} icon={<Landmark />} tone="amber" />
            <Metric label="Total a depositar" value={amount(liquidation?.total_depositar)} icon={<CheckCircle2 />} tone="green" prominent />
          </section>

          {partialPeriod && <section className={styles.prorationSummary} aria-label="Cálculo del periodo parcial">
            <CalendarDays aria-hidden="true" />
            <div><strong>{prorated ? 'Periodo parcial prorrateado' : 'Periodo parcial con honorario completo'}</strong>
              <span>{serviceDays} de {periodDays} días considerados · {formatDate(serviceStart)} al {formatDate(serviceEnd)}</span></div>
            <dl><div><dt>Honorario pactado</dt><dd>{amount(agreedMonthlyPayment)}</dd></div>
              <div><dt>Honorario aplicado</dt><dd>{amount(appliedMonthlyPayment)}</dd></div></dl>
          </section>}

          <div className={styles.mainGrid}>
            <section className={styles.calendarPanel}>
              <header className={styles.sectionHeader}>
                <div><CalendarDays /><span><strong>Control mensual de asistencia</strong><small>Contexto operativo del pago</small></span></div>
                <div className={styles.legend}><span className={styles.presentDot}>Asistió</span><span className={styles.lateDot}>Tardanza</span><span className={styles.absentDot}>Falta</span><span className={styles.justifiedDot}>Justificado</span></div>
              </header>
              <div className={styles.calendarTitle}>{monthTitle.format(new Date(`${month}-01T00:00:00Z`))}</div>
              <div className={styles.calendar}>
                {week.map(day => <span className={styles.weekDay} key={day}>{day}</span>)}
                {cells.map((day, index) => {
                  if (!day) return <span className={styles.emptyDay} key={`empty-${index}`} />;
                  const record = attendanceByDate.get(dayKey(month, day));
                  const status = String(record?.estado_asistencia ?? '').toUpperCase();
                  const justificationStatus = String(record?.justificacion_estado ?? '').toUpperCase();
                  const justifiedIncident = ['TARDANZA', 'FALTA'].includes(status) && justificationStatus === 'APROBADA';
                  const pendingJustification = ['TARDANZA', 'FALTA'].includes(status) && justificationStatus === 'PENDIENTE';
                  const calendarLabel = justifiedIncident
                    ? `${statusNames[status] ?? status} justificada`
                    : statusNames[status] ?? status;
                  return <div className={`${styles.day} ${status ? styles[`day_${status}`] ?? '' : ''} ${justifiedIncident ? styles.dayJustified : ''} ${pendingJustification ? styles.dayJustificationPending : ''}`} key={day}>
                    <span>{day}</span>
                    {record ? <><strong>{calendarLabel}</strong>{record.minutos_tardanza > 0 && <small>{duration(record.minutos_tardanza)}</small>}{pendingJustification && <small>En revisión</small>}</> : null}
                  </div>;
                })}
              </div>
            </section>

            <aside className={styles.sideColumn}>
              <section className={styles.attendanceSummary}>
                <div className={styles.sectionLabel}><UserRound />Resumen del mes</div>
                <div className={styles.summaryGrid}>
                  <Summary label="Días con asistencia" value={ledger.attendance_summary.attended} />
                  <Summary label="Con tardanza" value={ledger.attendance_summary.late} tone="amber" />
                  <Summary label="Faltas" value={ledger.attendance_summary.absent} tone="red" />
                  <Summary label="Justificados" value={ledger.attendance_summary.justified} tone="blue" />
                </div>
                <div className={styles.timeSummary}><span><Clock3 />Tardanza acumulada</span><strong>{duration(ledger.attendance_summary.delay_minutes)}</strong></div>
                {(ledger.attendance_summary.pending_justifications ?? 0) > 0 && <div className={styles.pendingSummary}><span>Justificaciones por revisar</span><strong>{ledger.attendance_summary.pending_justifications}</strong></div>}
              </section>

              <section className={styles.paymentStatus}>
                <div className={styles.sectionLabel}><ShieldCheck />Estado administrativo</div>
                <dl>
                  <div><dt>Liquidación</dt><dd>{liquidationNames[liquidation?.estado ?? 'PREVISUALIZACION'] ?? liquidation?.estado ?? 'Vista previa'}</dd></div>
                  <div><dt>Cuenta bancaria</dt><dd>{ledger.employee.banco ? `${ledger.employee.banco} ···· ${ledger.employee.numero_cuenta_ultimos4 ?? '—'}` : 'Pendiente de configurar'}</dd></div>
                  <div><dt>Recibo por honorarios</dt><dd>{liquidation?.rhe_numero ? `${liquidation.rhe_serie}-${liquidation.rhe_numero}` : 'Pendiente'}</dd></div>
                  <div><dt>Depósito</dt><dd>{liquidation?.pago_operacion ? `Operación ${liquidation.pago_operacion}` : 'No registrado'}</dd></div>
                </dl>
              </section>
            </aside>
          </div>

          <div className={styles.controlNotice} role="note" aria-label="Regla de liquidación">
            <ShieldCheck aria-hidden="true" />
            <span>
              <strong>Regla de liquidación</strong>
              <small>
                La asistencia registra lo ocurrido. Los ingresos y descuentos solo se aplican mediante
                un concepto autorizado y auditable. <b>Una falta no reduce el pago automáticamente.</b>
              </small>
            </span>
          </div>

          <div className={styles.detailGrid}>
            <section className={styles.detailPanel}>
              <div className={styles.sectionLabel}><ReceiptText />Composición de la liquidación</div>
              {ledger.concepts.length ? <div className={styles.concepts}>{ledger.concepts.map(concept => <div key={concept.id}><span><strong>{concept.descripcion}</strong><small>{concept.cantidad ? `${concept.cantidad} ${concept.unidad ?? ''}` : concept.tipo.replaceAll('_', ' ')}</small></span><b className={['ADELANTO', 'CUOTA_PRESTAMO', 'OTRO_DESCUENTO'].includes(concept.tipo) ? styles.negative : ''}>{['ADELANTO', 'CUOTA_PRESTAMO', 'OTRO_DESCUENTO'].includes(concept.tipo) ? '− ' : '+ '}{amount(concept.monto)}</b></div>)}</div>
                : <Empty text="El periodo aún no tiene una liquidación generada." />}
            </section>

            <section className={styles.detailPanel}>
              <div className={styles.sectionLabel}><Landmark />Adelantos y préstamos</div>
              {(ledger.movements.length || ledger.loans.length) ? <div className={styles.financialItems}>
                {ledger.movements.map(movement => <div key={`movement-${movement.id}`}><span><strong>{movement.concepto}</strong><small>{movement.tipo.replaceAll('_', ' ')} · {movement.estado}</small></span><b>{amount(movement.monto)}</b></div>)}
                {ledger.loans.map(loan => <div key={`loan-${loan.id}`}><span><strong>{loan.concepto}</strong><small>Saldo {amount(loan.saldo_pendiente)} · {loan.estado}</small></span><b>Cuota {amount(loan.cuota_mensual)}</b></div>)}
              </div> : <Empty text="No existen adelantos ni préstamos aplicables al periodo." />}
            </section>
          </div>

          <section className={styles.notesPanel}>
            <header>
              <div className={styles.notesHeading}>
                <div className={styles.sectionLabel}><NotebookPen />Notas administrativas</div>
                <small>Acuerdos y observaciones internas del periodo.</small>
              </div>
              <span className={styles.noteCounter}><b>{ledger.notes.filter(item => item.estado === 'ACTIVA').length}</b> vigentes</span>
            </header>
            {canManage && <form className={styles.noteForm} onSubmit={submitNote}>
              <label><span>Nota administrativa</span><textarea value={note} onChange={event => setNote(event.target.value)} maxLength={800} placeholder="Ej. El recibo por honorarios se entregará el 30 de agosto." /></label>
              <label className={styles.reference}><span>Monto relacionado (opcional)</span><input value={referenceAmount} onChange={event => setReferenceAmount(event.target.value)} type="number" min="0" step="0.01" placeholder="S/ 0.00" /></label>
              <Button type="submit" variant="corporate" loading={savingNote} disabled={note.trim().length < 3} icon={<NotebookPen />}>Guardar nota</Button>
            </form>}
            <div className={styles.notes}>
              {ledger.notes.map(item => <article className={item.estado === 'ANULADA' ? styles.cancelledNote : ''} key={item.id}>
                <div className={styles.noteRecord}>
                  <FileText />
                  <div className={styles.noteData}>
                    <div className={styles.noteTopline}>
                      <strong>{item.nota}</strong>
                      <span className={item.estado === 'ANULADA' ? styles.noteStatusCancelled : styles.noteStatusActive}>
                        {item.estado === 'ANULADA' ? 'Anulada' : 'Vigente'}
                      </span>
                    </div>
                    <small>Registrada por <b>{item.creado_por_nombre}</b> · {formatDate(item.created_at, true)}</small>
                    {item.monto_referencial !== null && <span className={styles.referenceValue}>Monto relacionado: <b>{amount(item.monto_referencial)}</b></span>}
                    {item.estado === 'ANULADA' && <em><b>Motivo de anulación:</b> {item.motivo_anulacion}</em>}
                  </div>
                </div>
                {canManage && item.estado === 'ACTIVA' && <button type="button" title="Anular nota" aria-label="Anular nota" onClick={() => { setCancelNoteId(item.id); setCancelReason(''); }}><Trash2 /></button>}
                {cancelNoteId === item.id && <div className={styles.cancelForm}><input autoFocus value={cancelReason} onChange={event => setCancelReason(event.target.value)} maxLength={300} placeholder="Motivo obligatorio de anulación" /><Button size="sm" variant="secondary" onClick={() => setCancelNoteId(null)}>Volver</Button><Button size="sm" variant="danger" loading={savingNote} disabled={cancelReason.trim().length < 3} onClick={() => void cancelNote()}>Confirmar</Button></div>}
              </article>)}
              {!ledger.notes.length && <Empty text="Todavía no se registraron notas administrativas para este mes." />}
            </div>
          </section>
        </div> : null}
  </Modal>;
}

function Metric({ label, value, detail, icon, tone = 'navy', prominent = false }: { label: string; value: string; detail?: string; icon: ReactNode; tone?: string; prominent?: boolean }) {
  return <article className={`${styles.metric} ${styles[tone]} ${prominent ? styles.prominent : ''}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong>{detail && <em>{detail}</em>}</div></article>;
}

function Summary({ label, value, tone = 'navy' }: { label: string; value: number; tone?: string }) {
  return <div className={`${styles.summary} ${styles[tone]}`}><strong>{value}</strong><span>{label}</span></div>;
}

function Empty({ text }: { text: string }) {
  return <div className={styles.empty}><FileText /><span>{text}</span></div>;
}
