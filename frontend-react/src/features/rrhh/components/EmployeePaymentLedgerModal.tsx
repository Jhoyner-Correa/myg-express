import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle, Calculator, CalendarDays, CheckCircle2, CircleAlert, Clock3, FileText,
  Landmark, NotebookPen, Pencil, Plus, Printer, ReceiptText, ShieldCheck, Trash2, UserRound, WalletCards,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { rrhhService } from '../rrhh.service';
import type { ServicePaymentEmployeeLedger, ServicePaymentRow } from '../types';
import { employeePhotoFallbackHandler, getEmployeePhotoUrl } from './employee-avatar';
import { PaymentDayDetailModal } from './PaymentDayDetailModal';
import { CutoffSettlementModal } from './CutoffSettlementModal';
import styles from './EmployeePaymentLedgerModal.module.css';

type Props = {
  employee: ServicePaymentRow | null;
  month: string;
  canManage: boolean;
  onClose: () => void;
  onUpdated?: () => void | Promise<void>;
};

const currency = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 });
const shortDate = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Lima' });
const dateTime = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima', hour12: true });
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

export function EmployeePaymentLedgerModal({ employee, month, canManage, onClose, onUpdated }: Props) {
  const [ledger, setLedger] = useState<ServicePaymentEmployeeLedger | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState('');
  const [referenceAmount, setReferenceAmount] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [cancelNoteId, setCancelNoteId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null);
  const [showCutoffModal, setShowCutoffModal] = useState<boolean>(false);

  // Movements management state
  const [movementModal, setMovementModal] = useState<{
    mode: 'create' | 'edit';
    movement?: ServicePaymentEmployeeLedger['movements'][number];
  } | null>(null);
  const [movementType, setMovementType] = useState<'ADELANTO' | 'OTRO_INGRESO' | 'OTRO_DESCUENTO'>('ADELANTO');
  const [movementConcept, setMovementConcept] = useState('');
  const [movementAmount, setMovementAmount] = useState('');
  const [savingMovement, setSavingMovement] = useState(false);
  const [movementError, setMovementError] = useState('');

  const [cancelMovementTarget, setCancelMovementTarget] = useState<ServicePaymentEmployeeLedger['movements'][number] | null>(null);
  const [cancelMovementReason, setCancelMovementReason] = useState('');
  const [deletingMovement, setDeletingMovement] = useState(false);

  // Loans management state
  const [loanModal, setLoanModal] = useState<{
    mode: 'create' | 'edit';
    loan?: ServicePaymentEmployeeLedger['loans'][number];
  } | null>(null);
  const [loanTotalAmount, setLoanTotalAmount] = useState('');
  const [loanInstallment, setLoanInstallment] = useState('');
  const [loanStartMonth, setLoanStartMonth] = useState(month);
  const [loanConcept, setLoanConcept] = useState('');
  const [savingLoan, setSavingLoan] = useState(false);
  const [loanError, setLoanError] = useState('');

  const [cancelLoanTarget, setCancelLoanTarget] = useState<ServicePaymentEmployeeLedger['loans'][number] | null>(null);
  const [cancelLoanReason, setCancelLoanReason] = useState('');
  const [cancellingLoan, setCancellingLoan] = useState(false);

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
    setSelectedDayDate(null);
    setMovementModal(null);
    setCancelMovementTarget(null);
    setLoanModal(null);
    setCancelLoanTarget(null);
  }, [employee?.empleado_id, month]);

  const attendanceByDate = useMemo(() => new Map((ledger?.attendance ?? []).map(record => [record.fecha, record])), [ledger?.attendance]);
  const cells = useMemo(() => calendarCells(month), [month]);
  const liquidation = ledger?.liquidation;
  const paymentPreview = ledger?.payment_preview;
  const deductions = Number(liquidation?.adelantos || 0) + Number(liquidation?.cuotas_prestamo || 0) + Number(liquidation?.otros_descuentos || 0);
  const confirmedAbsences = Number(liquidation?.faltas_confirmadas || 0);
  const pendingAbsences = Number(liquidation?.faltas_pendientes || 0);
  const absenceDiscount = Number(liquidation?.monto_descuento_faltas || 0);
  const pendingPartialAbsences = Number(liquidation?.inasistencias_parciales_pendientes || 0);
  const partialAbsenceMinutes = Number(liquidation?.minutos_inasistencia_parcial || 0);
  const partialAbsenceDiscount = Number(liquidation?.monto_descuento_inasistencia_parcial || 0);
  const discountDetail = pendingPartialAbsences > 0
    ? `${pendingPartialAbsences} jornada(s) parcial(es) por resolver`
    : partialAbsenceMinutes > 0
      ? `${duration(partialAbsenceMinutes)} no laboradas: ${amount(partialAbsenceDiscount)}`
      : confirmedAbsences
        ? `${confirmedAbsences} falta(s): ${amount(absenceDiscount)}`
        : 'Sin faltas descontadas';
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

  const isLiquidationLocked = ['PAGADO', 'EN_LOTE'].includes(String(liquidation?.estado ?? ''));
  const isPeriodLocked = Boolean(ledger?.period && ledger.period.estado !== 'BORRADOR');
  const canEditMovements = canManage && !isLiquidationLocked && !isPeriodLocked;

  const handleOpenCreateMovement = () => {
    setMovementModal({ mode: 'create' });
    setMovementType('ADELANTO');
    setMovementConcept('');
    setMovementAmount('');
    setMovementError('');
  };

  const handleOpenEditMovement = (mov: ServicePaymentEmployeeLedger['movements'][number]) => {
    setMovementModal({ mode: 'edit', movement: mov });
    setMovementType((mov.tipo as 'ADELANTO' | 'OTRO_INGRESO' | 'OTRO_DESCUENTO') || 'ADELANTO');
    setMovementConcept(mov.concepto);
    setMovementAmount(String(mov.monto));
    setMovementError('');
  };

  const handleSubmitMovement = async (e: FormEvent) => {
    e.preventDefault();
    if (!employee || !movementModal) return;
    const amountVal = Number(movementAmount);
    if (!amountVal || amountVal <= 0) {
      setMovementError('Ingresa un monto válido mayor a 0.');
      return;
    }
    if (movementConcept.trim().length < 3) {
      setMovementError('El concepto debe tener al menos 3 caracteres.');
      return;
    }

    setSavingMovement(true);
    setMovementError('');
    try {
      if (movementModal.mode === 'create') {
        await rrhhService.createPaymentMovement({
          employee_id: employee.empleado_id,
          month,
          type: movementType,
          concept: movementConcept.trim(),
          amount: amountVal,
        });
        showToast('Movimiento registrado y liquidación recalculada.', 'success');
      } else if (movementModal.movement) {
        await rrhhService.updatePaymentMovement(movementModal.movement.id, {
          type: movementType,
          concept: movementConcept.trim(),
          amount: amountVal,
        });
        showToast('Movimiento actualizado y liquidación recalculada.', 'success');
      }
      setMovementModal(null);
      await load();
      await onUpdated?.();
    } catch (requestError) {
      setMovementError(getApiErrorMessage(requestError, 'No se pudo guardar el movimiento.'));
    } finally {
      setSavingMovement(false);
    }
  };

  const handleConfirmDeleteMovement = async () => {
    if (!cancelMovementTarget) return;
    if (cancelMovementReason.trim().length < 3) {
      showToast('Debes indicar un motivo de anulación de al menos 3 caracteres.', 'error');
      return;
    }
    setDeletingMovement(true);
    try {
      await rrhhService.deletePaymentMovement(cancelMovementTarget.id, cancelMovementReason.trim());
      setCancelMovementTarget(null);
      setCancelMovementReason('');
      await load();
      await onUpdated?.();
      showToast('Movimiento anulado y liquidación recalculada.', 'success');
    } catch (requestError) {
      showToast(getApiErrorMessage(requestError, 'No se pudo anular el movimiento.'), 'error');
    } finally {
      setDeletingMovement(false);
    }
  };

  const handleOpenCreateLoan = () => {
    setLoanModal({ mode: 'create' });
    setLoanTotalAmount('');
    setLoanInstallment('');
    setLoanStartMonth(month);
    setLoanConcept('');
    setLoanError('');
  };

  const handleOpenEditLoan = (loan: ServicePaymentEmployeeLedger['loans'][number]) => {
    setLoanModal({ mode: 'edit', loan });
    setLoanTotalAmount(String(loan.monto_original));
    setLoanInstallment(String(loan.cuota_mensual));
    setLoanStartMonth(loan.periodo_inicio);
    setLoanConcept(loan.concepto);
    setLoanError('');
  };

  const handleSubmitLoan = async (e: FormEvent) => {
    e.preventDefault();
    if (!employee || !loanModal) return;
    const totalVal = Number(loanTotalAmount);
    const installmentVal = Number(loanInstallment);

    if (installmentVal <= 0) {
      setLoanError('La cuota mensual debe ser mayor a 0.');
      return;
    }
    if (loanModal.mode === 'create') {
      if (totalVal <= 0) {
        setLoanError('El monto total del préstamo debe ser mayor a 0.');
        return;
      }
      if (installmentVal > totalVal) {
        setLoanError('La cuota mensual no puede superar el monto total del préstamo.');
        return;
      }
    }
    if (loanConcept.trim().length < 3) {
      setLoanError('El concepto debe tener al menos 3 caracteres.');
      return;
    }

    setSavingLoan(true);
    setLoanError('');
    try {
      if (loanModal.mode === 'create') {
        await rrhhService.createEmployeeLoan({
          employee_id: employee.empleado_id,
          total_amount: totalVal,
          monthly_installment: installmentVal,
          start_month: loanStartMonth,
          concept: loanConcept.trim(),
        });
        showToast('Préstamo registrado exitosamente.', 'success');
      } else if (loanModal.loan) {
        await rrhhService.updateEmployeeLoan(loanModal.loan.id, {
          monthly_installment: installmentVal,
          concept: loanConcept.trim(),
          ...(Number(loanModal.loan.saldo_pendiente) === Number(loanModal.loan.monto_original)
            ? { total_amount: totalVal }
            : {}),
        });
        showToast('Préstamo actualizado y liquidación recalculada.', 'success');
      }
      setLoanModal(null);
      await load();
      await onUpdated?.();
    } catch (requestError) {
      setLoanError(getApiErrorMessage(requestError, 'No se pudo guardar el préstamo.'));
    } finally {
      setSavingLoan(false);
    }
  };

  const handleConfirmCancelLoan = async () => {
    if (!cancelLoanTarget) return;
    if (cancelLoanReason.trim().length < 3) {
      showToast('Debes indicar un motivo de cancelación de al menos 3 caracteres.', 'error');
      return;
    }
    setCancellingLoan(true);
    try {
      await rrhhService.cancelEmployeeLoan(cancelLoanTarget.id, cancelLoanReason.trim());
      setCancelLoanTarget(null);
      setCancelLoanReason('');
      await load();
      await onUpdated?.();
      showToast('Préstamo cancelado y liquidación recalculada.', 'success');
    } catch (requestError) {
      showToast(getApiErrorMessage(requestError, 'No se pudo cancelar el préstamo.'), 'error');
    } finally {
      setCancellingLoan(false);
    }
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
    footer={<>
      <Button variant="corporate" icon={<Calculator size={16} />} onClick={() => setShowCutoffModal(true)}>
        Corte / Finiquito a la fecha
      </Button>
      <Button variant="secondary" icon={<Printer size={16} />} onClick={() => window.print()}>
        Imprimir liquidación
      </Button>
      <Button variant="secondary" onClick={onClose}>Cerrar expediente</Button>
    </>}
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
            <Metric label="Horas extra & bonos" value={amount(Number(liquidation?.monto_horas_extra || 0) + Number(liquidation?.otros_ingresos || 0))} detail={ledger.attendance_summary.overtime_minutes > 0 ? duration(ledger.attendance_summary.overtime_minutes) : undefined} icon={<Clock3 />} tone="violet" />
            <Metric label="Total Bruto (RHE SUNAT)" value={amount(liquidation?.total_servicio ?? appliedMonthlyPayment)} detail="Comprobante fiscal" icon={<FileText />} tone="blue" />
            <Metric label="Descuentos totales" value={amount(deductions)} detail={discountDetail} icon={<Landmark />} tone="amber" />
            <Metric label="Total a depositar (Neto)" value={amount(liquidation?.total_depositar ?? appliedMonthlyPayment)} icon={<CheckCircle2 />} tone="green" prominent />
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
                <div><CalendarDays /><span><strong>Control mensual de asistencia</strong><small>Haz clic en cualquier fecha para ver el detalle de marcaciones e incidencias</small></span></div>
                <div className={styles.legend}>
                  <span className={styles.presentDot}>Asistió</span>
                  <span className={styles.lateDot}>Tardanza</span>
                  <span className={styles.absentDot}>Falta</span>
                  <span className={styles.justifiedDot}>Justificado</span>
                  <span className={styles.overtimeDot}>Horas extra</span>
                </div>
              </header>
              <div className={styles.calendarTitle}>{monthTitle.format(new Date(`${month}-01T00:00:00Z`))}</div>
              <div className={styles.calendar}>
                {week.map(day => <span className={styles.weekDay} key={day}>{day}</span>)}
                {cells.map((day, index) => {
                  if (!day) return <span className={styles.emptyDay} key={`empty-${index}`} />;
                  const dateKey = dayKey(month, day);
                  const record = attendanceByDate.get(dateKey);
                  const status = String(record?.estado_asistencia ?? '').toUpperCase();
                  const justificationStatus = String(record?.justificacion_estado ?? '').toUpperCase();
                  const justifiedIncident = ['TARDANZA', 'FALTA'].includes(status) && justificationStatus === 'APROBADA';
                  const pendingJustification = ['TARDANZA', 'FALTA'].includes(status) && justificationStatus === 'PENDIENTE';
                  const hasOvertime = Number(record?.minutos_horas_extra || 0) > 0;
                  const calendarLabel = justifiedIncident
                    ? `${statusNames[status] ?? status} justificada`
                    : statusNames[status] ?? status;
                  return (
                    <div
                      role="button"
                      tabIndex={0}
                      className={`${styles.day} ${styles.clickableDay} ${status ? styles[`day_${status}`] ?? '' : ''} ${justifiedIncident ? styles.dayJustified : ''} ${pendingJustification ? styles.dayJustificationPending : ''}`}
                      key={day}
                      title={`Día ${day}: Haz clic para ver detalle de marcaciones, horario y liquidación`}
                      onClick={() => setSelectedDayDate(dateKey)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedDayDate(dateKey);
                        }
                      }}
                    >
                      <span>{day}</span>
                      {record ? (
                        <>
                          <strong>{calendarLabel}</strong>
                          {record.minutos_tardanza > 0 && <small>{duration(record.minutos_tardanza)}</small>}
                          {hasOvertime && (
                            <span className={styles.overtimeChip}>
                              +{duration(record.minutos_horas_extra)}
                            </span>
                          )}
                          {pendingJustification && <small>En revisión</small>}
                        </>
                      ) : null}
                    </div>
                  );
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
                {confirmedAbsences > 0 && <div className={styles.pendingSummary}><span>Faltas con descuento</span><strong>{confirmedAbsences} · {amount(absenceDiscount)}</strong></div>}
                {pendingAbsences > 0 && <div className={styles.pendingSummary}><span>Faltas por resolver</span><strong>{pendingAbsences}</strong></div>}
                {partialAbsenceMinutes > 0 && <div className={styles.pendingSummary}><span>Tiempo parcial descontado</span><strong>{duration(partialAbsenceMinutes)} Â· {amount(partialAbsenceDiscount)}</strong></div>}
                {pendingPartialAbsences > 0 && <div className={styles.pendingSummary}><span>Jornadas parciales por resolver</span><strong>{pendingPartialAbsences}</strong></div>}
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
                Una falta queda pendiente mientras puede justificarse. Si RR. HH. la justifica, no descuenta;
                si la confirma o vence el plazo, se descuenta el valor diario. En jornadas parciales solo se
                descuentan los minutos que RR. HH. confirme; el tiempo compensado no se paga otra vez como hora extra.
              </small>
            </span>
          </div>

          {/* Pre-boleta formal imprimible de liquidación */}
          <article className={styles.voucherCard} aria-label="Liquidación de servicios">
            <header className={styles.voucherHeader}>
              <div>
                <span className={styles.voucherCompany}>M&G Express · Liquidación de Servicios</span>
                <h4>Boleta de Honorarios y Servicios</h4>
                <small>Periodo: {monthTitle.format(new Date(`${month}-01T00:00:00Z`))}</small>
              </div>
              <div className={styles.voucherBadge}>
                <span className={styles.voucherStatus}>
                  {liquidationNames[liquidation?.estado ?? 'PREVISUALIZACION'] ?? liquidation?.estado ?? 'Vista previa'}
                </span>
                {liquidation?.rhe_numero ? (
                  <small>RHE {liquidation.rhe_serie}-{liquidation.rhe_numero}</small>
                ) : (
                  <small>RHE no emitido</small>
                )}
              </div>
            </header>

            <div className={styles.voucherWorkerData}>
              <div>
                <span>Colaborador</span>
                <strong>{ledger.employee.nombres} {ledger.employee.apellidos}</strong>
              </div>
              <div>
                <span>Documento</span>
                <strong>DNI {ledger.employee.dni || '—'}</strong>
              </div>
              <div>
                <span>Cargo / Sede</span>
                <strong>{ledger.employee.cargo} · {ledger.employee.sede}</strong>
              </div>
              <div>
                <span>Código</span>
                <strong>{ledger.employee.codigo_empleado}</strong>
              </div>
            </div>

            <div className={styles.voucherTables}>
              <div className={styles.voucherCol}>
                <div className={styles.voucherTableHeading}>
                  <span>1. Ingresos y Servicios Prestados</span>
                </div>
                <table className={styles.voucherTable}>
                  <tbody>
                    <tr>
                      <td>
                        Honorario base del periodo
                        {partialPeriod && <><br /><small>{serviceDays} de {periodDays} días computados</small></>}
                      </td>
                      <td className={styles.voucherNum}>{amount(appliedMonthlyPayment)}</td>
                    </tr>
                    {Number(liquidation?.monto_horas_extra || 0) > 0 && (
                      <tr>
                        <td>
                          Horas extras reconocidas
                          <br /><small>{duration(ledger.attendance_summary.overtime_minutes)} trabajadas</small>
                        </td>
                        <td className={styles.voucherNum}>{amount(liquidation?.monto_horas_extra)}</td>
                      </tr>
                    )}
                    {Number(liquidation?.otros_ingresos || 0) > 0 && (
                      <tr>
                        <td>Otros ingresos y bonificaciones</td>
                        <td className={styles.voucherNum}>{amount(liquidation?.otros_ingresos)}</td>
                      </tr>
                    )}
                    <tr className={styles.voucherSubtotalRow}>
                      <td><strong>Total Bruto (Comprobante SUNAT)</strong></td>
                      <td className={styles.voucherNum}>
                        <strong>{amount(liquidation?.total_servicio ?? appliedMonthlyPayment)}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className={styles.voucherCol}>
                <div className={styles.voucherTableHeading}>
                  <span>2. Deducciones y Compensaciones</span>
                </div>
                <table className={styles.voucherTable}>
                  <tbody>
                    {absenceDiscount > 0 && (
                      <tr>
                        <td>
                          Descuento por inasistencia
                          <br /><small>{confirmedAbsences} día(s) no laborado(s)</small>
                        </td>
                        <td className={styles.voucherNum}>− {amount(absenceDiscount)}</td>
                      </tr>
                    )}
                    {partialAbsenceDiscount > 0 && (
                      <tr>
                        <td>
                          Descuento tiempo parcial
                          <br /><small>{duration(partialAbsenceMinutes)} no compensadas</small>
                        </td>
                        <td className={styles.voucherNum}>− {amount(partialAbsenceDiscount)}</td>
                      </tr>
                    )}
                    {Number(liquidation?.adelantos || 0) > 0 && (
                      <tr>
                        <td>Adelanto de honorarios</td>
                        <td className={styles.voucherNum}>− {amount(liquidation?.adelantos)}</td>
                      </tr>
                    )}
                    {Number(liquidation?.cuotas_prestamo || 0) > 0 && (
                      <tr>
                        <td>Cuota de préstamo</td>
                        <td className={styles.voucherNum}>− {amount(liquidation?.cuotas_prestamo)}</td>
                      </tr>
                    )}
                    {(() => {
                      const otherDiscounts = Math.max(0, Number(liquidation?.otros_descuentos || 0) - absenceDiscount - partialAbsenceDiscount);
                      if (otherDiscounts > 0) {
                        return (
                          <tr>
                            <td>Otros descuentos aplicados</td>
                            <td className={styles.voucherNum}>− {amount(otherDiscounts)}</td>
                          </tr>
                        );
                      }
                      return null;
                    })()}
                    {deductions === 0 && (
                      <tr>
                        <td colSpan={2} className={styles.voucherEmptyRow}>
                          Sin deducciones ni compensaciones en el periodo
                        </td>
                      </tr>
                    )}
                    <tr className={styles.voucherSubtotalRow}>
                      <td><strong>Total Deducciones</strong></td>
                      <td className={styles.voucherNum}>
                        <strong>{deductions > 0 ? `− ${amount(deductions)}` : amount(0)}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <footer className={styles.voucherFooter}>
              <div className={styles.voucherBankDetail}>
                <span>Información de Abono Bancario</span>
                <strong>
                  {ledger.employee.banco ? `${ledger.employee.banco} ···· ${ledger.employee.numero_cuenta_ultimos4 ?? '—'}` : 'Cuenta bancaria pendiente'}
                </strong>
                {liquidation?.pago_operacion ? (
                  <small>Operación #{liquidation.pago_operacion} · {formatDate(liquidation.pago_fecha)}</small>
                ) : liquidation?.lote_codigo ? (
                  <small>Lote #{liquidation.lote_codigo}</small>
                ) : (
                  <small>Pendiente de programación bancaria</small>
                )}
              </div>
              <div className={styles.voucherFinalAmount}>
                <span>Neto a Transferir:</span>
                <strong>{amount(liquidation?.total_depositar ?? appliedMonthlyPayment)}</strong>
              </div>
            </footer>
          </article>

          {/* Panel Ejecutivo: Movimientos, Adelantos y Préstamos */}
          <section className={styles.financialSection} aria-label="Gestión de adelantos y préstamos">
            <header className={styles.financialHeader}>
              <div className={styles.financialHeaderTitle}>
                <div className={styles.sectionLabel}>
                  <Landmark />
                  <span>Adelantos, préstamos y compensaciones financieras</span>
                </div>
                <small>Control auditable de retenciones, adelantos de quincena y amortización de préstamos empresariales.</small>
              </div>
              {canManage && (
                <div className={styles.financialActions}>
                  <Button
                    type="button"
                    size="sm"
                    variant="corporate"
                    icon={<Plus size={14} />}
                    disabled={!canEditMovements}
                    title={!canEditMovements ? 'El periodo o liquidación se encuentra cerrado/pagado' : 'Registrar nuevo adelanto o bono'}
                    onClick={handleOpenCreateMovement}
                  >
                    + Adelanto / Ajuste
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    icon={<Landmark size={14} />}
                    disabled={!canManage}
                    title="Otorgar préstamo corporativo con descuento mensual"
                    onClick={handleOpenCreateLoan}
                  >
                    + Nuevo préstamo
                  </Button>
                </div>
              )}
            </header>

            {isLiquidationLocked && (
              <div className={styles.lockedNotice}>
                <ShieldCheck size={16} />
                <span>Liquidación {liquidation?.estado?.toLowerCase()}: Los adelantos y movimientos quedan bloqueados para proteger el registro bancario y fiscal.</span>
              </div>
            )}

            <div className={styles.financialSplit}>
              {/* Columna Izquierda: Adelantos y Movimientos del Mes */}
              <div className={styles.financialBlock}>
                <div className={styles.blockHeading}>
                  <WalletCards size={15} />
                  <span>Movimientos del periodo ({monthTitle.format(new Date(`${month}-01T00:00:00Z`))})</span>
                  <span className={styles.blockCount}>{ledger.movements.length}</span>
                </div>
                {ledger.movements.length > 0 ? (
                  <div className={styles.movementsList}>
                    {ledger.movements.map(mov => {
                      const isExpense = mov.tipo === 'ADELANTO' || mov.tipo === 'OTRO_DESCUENTO';
                      return (
                        <div key={`movement-${mov.id}`} className={styles.movementItem}>
                          <div className={styles.movementLeading}>
                            <span className={`${styles.movementBadge} ${styles[`badge_${mov.tipo.toLowerCase()}`]}`}>
                              {mov.tipo === 'ADELANTO' ? 'Adelanto' : mov.tipo === 'OTRO_INGRESO' ? 'Bono / Ingreso' : 'Descuento'}
                            </span>
                            <div className={styles.movementTexts}>
                              <strong>{mov.concepto}</strong>
                              <small>
                                Registrado el {formatDate(mov.created_at)} · {mov.estado === 'APLICADO' ? 'Aplicado en liquidación' : 'Borrador'}
                              </small>
                            </div>
                          </div>
                          <div className={styles.movementTrailing}>
                            <b className={isExpense ? styles.amountNegative : styles.amountPositive}>
                              {isExpense ? '− ' : '+ '}{amount(mov.monto)}
                            </b>
                            {canEditMovements && (
                              <div className={styles.itemActions}>
                                <button
                                  type="button"
                                  className={styles.actionBtnEdit}
                                  title="Editar movimiento"
                                  onClick={() => handleOpenEditMovement(mov)}
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  type="button"
                                  className={styles.actionBtnDelete}
                                  title="Anular movimiento"
                                  onClick={() => {
                                    setCancelMovementTarget(mov);
                                    setCancelMovementReason('');
                                  }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.emptyBlock}>
                    <p>Sin adelantos ni ajustes registrados en este mes.</p>
                  </div>
                )}
              </div>

              {/* Columna Derecha: Préstamos al Colaborador */}
              <div className={styles.financialBlock}>
                <div className={styles.blockHeading}>
                  <Landmark size={15} />
                  <span>Préstamos corporativos en curso</span>
                  <span className={styles.blockCount}>{ledger.loans.length}</span>
                </div>
                {ledger.loans.length > 0 ? (
                  <div className={styles.loansList}>
                    {ledger.loans.map(loan => {
                      const original = Number(loan.monto_original || 0);
                      const balance = Number(loan.saldo_pendiente || 0);
                      const amortized = Math.max(0, original - balance);
                      const pct = original > 0 ? Math.min(100, Math.round((amortized / original) * 100)) : 0;
                      const isActive = loan.estado === 'ACTIVO';
                      return (
                        <div key={`loan-${loan.id}`} className={styles.loanCard}>
                          <div className={styles.loanCardHeader}>
                            <div className={styles.loanTitleWrapper}>
                              <strong>{loan.concepto}</strong>
                              <small>Desde {loan.periodo_inicio} · Cuota {amount(loan.cuota_mensual)}/mes</small>
                            </div>
                            <div className={styles.loanStatusWrapper}>
                              <span className={`${styles.loanStatusBadge} ${styles[`loanStatus_${loan.estado.toLowerCase()}`]}`}>
                                {loan.estado}
                              </span>
                              {canManage && isActive && (
                                <div className={styles.itemActions}>
                                  <button
                                    type="button"
                                    className={styles.actionBtnEdit}
                                    title="Modificar cuota del préstamo"
                                    onClick={() => handleOpenEditLoan(loan)}
                                  >
                                    <Pencil size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.actionBtnDelete}
                                    title="Cancelar préstamo"
                                    onClick={() => {
                                      setCancelLoanTarget(loan);
                                      setCancelLoanReason('');
                                    }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className={styles.loanProgressSection}>
                            <div className={styles.progressBarTrack}>
                              <div className={styles.progressBarFill} style={{ width: `${pct}%` }} />
                            </div>
                            <div className={styles.progressLabels}>
                              <span>Amortizado: {amount(amortized)} ({pct}%)</span>
                              <span>Saldo restante: <b>{amount(balance)}</b></span>
                            </div>
                          </div>

                          <div className={styles.loanFooterMetrics}>
                            <div>
                              <span>Monto total entregado:</span>
                              <b>{amount(original)}</b>
                            </div>
                            <div>
                              <span>Descuento este periodo:</span>
                              <strong>− {amount(isActive ? Math.min(Number(loan.cuota_mensual), balance) : 0)}</strong>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.emptyBlock}>
                    <p>El colaborador no tiene préstamos registrados.</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className={styles.detailPanel}>
            <div className={styles.sectionLabel}><ReceiptText />Composición contable de la liquidación</div>
            {ledger.concepts.length ? <div className={styles.concepts}>{ledger.concepts.map(concept => <div key={concept.id}><span><strong>{concept.descripcion}</strong><small>{concept.cantidad ? `${concept.cantidad} ${concept.unidad ?? ''}` : concept.tipo.replaceAll('_', ' ')}</small></span><b className={['ADELANTO', 'CUOTA_PRESTAMO', 'OTRO_DESCUENTO'].includes(concept.tipo) ? styles.negative : ''}>{['ADELANTO', 'CUOTA_PRESTAMO', 'OTRO_DESCUENTO'].includes(concept.tipo) ? '− ' : '+ '}{amount(concept.monto)}</b></div>)}</div>
              : <Empty text="El periodo aún no tiene una liquidación generada." />}
          </section>

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
          <PaymentDayDetailModal
            date={selectedDayDate}
            employee={ledger?.employee ? {
              id: ledger.employee.id,
              codigo_empleado: ledger.employee.codigo_empleado,
              nombres: ledger.employee.nombres,
              apellidos: ledger.employee.apellidos,
              cargo: ledger.employee.cargo,
              sede: ledger.employee.sede,
              sede_id: ledger.employee.sede_id,
              pago_mensual: Number(appliedMonthlyPayment || ledger.employee.pago_mensual || 0),
              tarifa_hora_extra: Number(ledger.employee.tarifa_hora_extra || 0),
              tarifa_hora_extra_modo: ledger.employee.tarifa_hora_extra_modo,
            } : null}
            periodDays={periodDays}
            canManage={canManage}
            onClose={() => setSelectedDayDate(null)}
            onResolved={async () => {
              await load();
            }}
          />
          <CutoffSettlementModal
            employee={showCutoffModal ? employee : null}
            month={month}
            canManage={canManage}
            onClose={() => setShowCutoffModal(false)}
            onUpdated={async () => {
              await load();
            }}
          />

          {/* Modales de Gestión de Movimientos */}
          {movementModal && (
            <Modal
              open
              title={movementModal.mode === 'create' ? 'Registrar Adelanto o Ajuste' : 'Editar Movimiento del Periodo'}
              description="Los cambios se reflejan inmediatamente en la boleta y el neto a transferir."
              icon={<WalletCards />}
              maxWidth={500}
              onClose={() => setMovementModal(null)}
              footer={
                <div className={styles.dialogFooter}>
                  <Button variant="secondary" onClick={() => setMovementModal(null)}>Cancelar</Button>
                  <Button type="submit" form="movement-form" variant="corporate" loading={savingMovement}>
                    {movementModal.mode === 'create' ? 'Registrar' : 'Guardar cambios'}
                  </Button>
                </div>
              }
            >
              <form id="movement-form" className={styles.dialogForm} onSubmit={handleSubmitMovement}>
                {movementError && (
                  <div className={styles.dialogAlertDanger} role="alert">
                    <AlertTriangle size={16} />
                    <span>{movementError}</span>
                  </div>
                )}
                <div className={styles.dialogFormGroup}>
                  <label htmlFor="movement-type">Tipo de movimiento</label>
                  <select
                    id="movement-type"
                    value={movementType}
                    onChange={e => setMovementType(e.target.value as 'ADELANTO' | 'OTRO_INGRESO' | 'OTRO_DESCUENTO')}
                  >
                    <option value="ADELANTO">Adelanto de honorarios (Descuenta al neto)</option>
                    <option value="OTRO_INGRESO">Bono / Otro ingreso (Suma al neto)</option>
                    <option value="OTRO_DESCUENTO">Otro descuento / Retención (Descuenta al neto)</option>
                  </select>
                </div>
                <div className={styles.dialogFormGroup}>
                  <label htmlFor="movement-amount">Importe en soles (S/)</label>
                  <input
                    id="movement-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    autoFocus
                    required
                    value={movementAmount}
                    onChange={e => setMovementAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className={styles.dialogFormGroup}>
                  <label htmlFor="movement-concept">Concepto o motivo</label>
                  <input
                    id="movement-concept"
                    type="text"
                    required
                    value={movementConcept}
                    onChange={e => setMovementConcept(e.target.value)}
                    placeholder="Ej. Adelanto quincenal 15 de mes"
                  />
                </div>
                <div className={styles.dialogAlertWarning}>
                  <ShieldCheck size={16} />
                  <span>
                    Al guardar, la liquidación en borrador se recalculará automáticamente para actualizar el recibo SUNAT y el depósito neto.
                  </span>
                </div>
              </form>
            </Modal>
          )}

          {cancelMovementTarget && (
            <Modal
              open
              title="Anular Movimiento Financiero"
              description="Esta acción eliminará el concepto y recalculará la liquidación."
              icon={<AlertTriangle />}
              maxWidth={460}
              onClose={() => setCancelMovementTarget(null)}
              footer={
                <div className={styles.dialogFooter}>
                  <Button variant="secondary" onClick={() => setCancelMovementTarget(null)}>Volver</Button>
                  <Button
                    variant="danger"
                    loading={deletingMovement}
                    disabled={cancelMovementReason.trim().length < 3}
                    onClick={handleConfirmDeleteMovement}
                  >
                    Sí, anular movimiento
                  </Button>
                </div>
              }
            >
              <div className={styles.dialogForm}>
                <div className={styles.dialogAlertDanger}>
                  <AlertTriangle size={18} />
                  <div>
                    <strong>¿Deseas anular este movimiento?</strong>
                    <p style={{ margin: '4px 0 0' }}>
                      {cancelMovementTarget.concepto} · <b>{amount(cancelMovementTarget.monto)}</b> ({cancelMovementTarget.tipo.replaceAll('_', ' ')})
                    </p>
                  </div>
                </div>
                <div className={styles.dialogFormGroup}>
                  <label htmlFor="cancel-movement-reason">Motivo obligatorio de anulación</label>
                  <textarea
                    id="cancel-movement-reason"
                    autoFocus
                    required
                    rows={2}
                    value={cancelMovementReason}
                    onChange={e => setCancelMovementReason(e.target.value)}
                    placeholder="Ej. Error en digitación de monto acordado con el colaborador"
                  />
                </div>
              </div>
            </Modal>
          )}

          {/* Modales de Gestión de Préstamos */}
          {loanModal && (
            <Modal
              open
              title={loanModal.mode === 'create' ? 'Registrar Préstamo al Colaborador' : 'Modificar Cuota de Préstamo'}
              description="Las cuotas se deducirán mensualmente del neto a pagar hasta cancelar el saldo."
              icon={<Landmark />}
              maxWidth={500}
              onClose={() => setLoanModal(null)}
              footer={
                <div className={styles.dialogFooter}>
                  <Button variant="secondary" onClick={() => setLoanModal(null)}>Cancelar</Button>
                  <Button type="submit" form="loan-form" variant="corporate" loading={savingLoan}>
                    {loanModal.mode === 'create' ? 'Crear préstamo' : 'Guardar cambios'}
                  </Button>
                </div>
              }
            >
              <form id="loan-form" className={styles.dialogForm} onSubmit={handleSubmitLoan}>
                {loanError && (
                  <div className={styles.dialogAlertDanger} role="alert">
                    <AlertTriangle size={16} />
                    <span>{loanError}</span>
                  </div>
                )}
                <div className={styles.dialogFormGroup}>
                  <label htmlFor="loan-concept">Concepto o descripción</label>
                  <input
                    id="loan-concept"
                    type="text"
                    autoFocus
                    required
                    value={loanConcept}
                    onChange={e => setLoanConcept(e.target.value)}
                    placeholder="Ej. Préstamo personal para gastos médicos"
                  />
                </div>
                <div className={styles.dialogFormGroup}>
                  <label htmlFor="loan-total">
                    Monto total entregado (S/)
                    {loanModal.mode === 'edit' && Number(loanModal.loan?.saldo_pendiente) < Number(loanModal.loan?.monto_original) && (
                      <span style={{ fontSize: '10px', color: '#64748b' }}> (Protegido por amortizaciones previas)</span>
                    )}
                  </label>
                  <input
                    id="loan-total"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    disabled={loanModal.mode === 'edit' && Number(loanModal.loan?.saldo_pendiente) < Number(loanModal.loan?.monto_original)}
                    value={loanTotalAmount}
                    onChange={e => setLoanTotalAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className={styles.dialogFormGroup}>
                  <label htmlFor="loan-installment">Cuota mensual de descuento (S/)</label>
                  <input
                    id="loan-installment"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={loanInstallment}
                    onChange={e => setLoanInstallment(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                {loanModal.mode === 'create' && (
                  <div className={styles.dialogFormGroup}>
                    <label htmlFor="loan-start-month">Mes de inicio de cobro</label>
                    <input
                      id="loan-start-month"
                      type="month"
                      required
                      value={loanStartMonth}
                      onChange={e => setLoanStartMonth(e.target.value)}
                    />
                  </div>
                )}
                <div className={styles.dialogAlertWarning}>
                  <ShieldCheck size={16} />
                  <span>
                    {loanModal.mode === 'create'
                      ? 'La cuota se descontará de forma automática en cada cierre de liquidación hasta agotar el saldo.'
                      : 'Modificar la cuota ajusta el descuento del periodo actual y recalcula la liquidación en borrador.'}
                  </span>
                </div>
              </form>
            </Modal>
          )}

          {cancelLoanTarget && (
            <Modal
              open
              title="Confirmar Cancelación de Préstamo"
              description="Control de amortización y protección de liquidaciones históricas."
              icon={<AlertTriangle />}
              maxWidth={480}
              onClose={() => setCancelLoanTarget(null)}
              footer={
                <div className={styles.dialogFooter}>
                  <Button variant="secondary" onClick={() => setCancelLoanTarget(null)}>Volver</Button>
                  <Button
                    variant="danger"
                    loading={cancellingLoan}
                    disabled={cancelLoanReason.trim().length < 3}
                    onClick={handleConfirmCancelLoan}
                  >
                    Confirmar cancelación
                  </Button>
                </div>
              }
            >
              <div className={styles.dialogForm}>
                <div className={styles.dialogAlertDanger}>
                  <AlertTriangle size={20} />
                  <div>
                    <strong>{cancelLoanTarget.concepto}</strong>
                    <p style={{ margin: '4px 0 0', fontSize: '11.5px' }}>
                      {Number(cancelLoanTarget.saldo_pendiente) === Number(cancelLoanTarget.monto_original) ? (
                        'Este préstamo aún no tiene pagos descontados. Será eliminado por completo de la base de datos sin afectar meses anteriores.'
                      ) : (
                        `Este préstamo ya cuenta con amortizaciones en meses cerrados. Al cancelarlo, el saldo restante de ${amount(cancelLoanTarget.saldo_pendiente)} dejará de descontarse en adelante, protegiendo la contabilidad histórica.`
                      )}
                    </p>
                  </div>
                </div>
                <div className={styles.dialogFormGroup}>
                  <label htmlFor="cancel-loan-reason">Motivo obligatorio de cancelación</label>
                  <textarea
                    id="cancel-loan-reason"
                    autoFocus
                    required
                    rows={2}
                    value={cancelLoanReason}
                    onChange={e => setCancelLoanReason(e.target.value)}
                    placeholder="Ej. Condonación acordada por gerencia o saldo amortizado en efectivo"
                  />
                </div>
              </div>
            </Modal>
          )}
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
