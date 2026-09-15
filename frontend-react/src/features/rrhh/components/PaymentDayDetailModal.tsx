import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle, CheckCircle2, Clock3, ClockAlert, FileCheck2, Landmark,
  ShieldCheck, TimerReset, X,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { PageLoader } from '../../../components/ui/PageLoader/PageLoader';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { rrhhService } from '../rrhh.service';
import type { AttendanceDetail } from '../types';
import { formatAttendanceClock, formatDurationMinutes, formatScheduleRange } from './attendance-formatters';
import styles from './PaymentDayDetailModal.module.css';

export type PaymentDayEmployeeInfo = {
  id: number;
  codigo_empleado: string;
  nombres: string;
  apellidos: string;
  cargo: string;
  sede: string;
  sede_id: number;
  pago_mensual: number;
  tarifa_hora_extra?: number;
  tarifa_hora_extra_modo?: 'AUTOMATICA' | 'MANUAL' | null;
};

type Props = {
  date: string | null;
  employee: PaymentDayEmployeeInfo | null;
  periodDays: number;
  canManage: boolean;
  onClose: () => void;
  onResolved: () => void;
};

const currency = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 });

const statusNames: Record<string, string> = {
  PRESENTE: 'Asistió',
  TARDANZA: 'Tardanza',
  FALTA: 'Falta',
  PERMISO: 'Permiso',
  VACACIONES: 'Vacaciones',
  NO_LABORABLE: 'No laborable',
  DESCANSO: 'Descanso',
  SIN_REGISTRO: 'Sin marcación',
};

function formatLongDate(dateStr: string) {
  const parsed = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  const formatted = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(parsed);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function PaymentDayDetailModal({
  date, employee, periodDays, canManage, onClose, onResolved,
}: Props) {
  const [detail, setDetail] = useState<AttendanceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Formulario de resolución in-situ
  const [partialAction, setPartialAction] = useState<'JUSTIFY' | 'DEDUCT'>('JUSTIFY');
  const [faltaAction, setFaltaAction] = useState<'JUSTIFY' | 'CONFIRM'>('JUSTIFY');
  const [resolutionComment, setResolutionComment] = useState('');
  const [savingResolution, setSavingResolution] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!date || !employee) return;
    setLoading(true);
    setError(null);
    try {
      const data = await rrhhService.getAttendanceDetail(employee.sede_id, employee.id, date, signal);
      setDetail(data);
    } catch (loadError) {
      if (!axios.isCancel(loadError)) setError(loadError);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [date, employee]);

  useEffect(() => {
    if (!date || !employee) {
      setDetail(null);
      return;
    }
    setResolutionComment('');
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [date, employee, load]);

  useEffect(() => {
    if (!date || !employee) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [date, employee, onClose]);

  // Cálculos de tarifas económicas
  const monthlySalary = Number(employee?.pago_mensual || 0);
  const daysInPeriod = periodDays > 0 ? periodDays : 30;
  const dailyRate = Math.round((monthlySalary / daysInPeriod) * 100) / 100;
  const minuteRate = monthlySalary / daysInPeriod / 8 / 60;
  const hourlyOvertimeRate = employee?.tarifa_hora_extra_modo === 'MANUAL' && Number(employee?.tarifa_hora_extra || 0) > 0
    ? Number(employee.tarifa_hora_extra)
    : Math.round((dailyRate / 8) * 100) / 100;

  // Marcaciones
  const marksMap = useMemo(() => {
    const map = new Map<string, AttendanceDetail['marks'][number]>();
    (detail?.marks ?? []).forEach(m => map.set(m.tipo_marcacion, m));
    return map;
  }, [detail?.marks]);

  const markEntrada = marksMap.get('ENTRADA');
  const markAlmuerzoSalida = marksMap.get('SALIDA_ALMUERZO');
  const markRegreso = marksMap.get('REGRESO');
  const markSalida = marksMap.get('SALIDA');

  // Horario
  const attendance = detail?.attendance;
  const hasSchedule = Boolean(attendance?.hora_entrada && attendance?.hora_salida);
  const scheduleRange = hasSchedule
    ? formatScheduleRange(attendance!.hora_entrada!, attendance!.hora_salida!)
    : 'No programado';

  // Inasistencia parcial (Tardanzas / Salidas anticipadas)
  const partial = detail?.partial_absence;
  const hasPartialAbsence = Boolean(partial && partial.status !== 'INVALIDADA');
  const missedMinutes = partial ? partial.missed_minutes : Number(attendance?.minutos_tardanza || 0);
  const partialDeductibleMinutes = partial?.deductible_minutes ?? 0;
  const partialDeductionAmount = Math.round(minuteRate * (partial?.status === 'PENDIENTE' ? missedMinutes : partialDeductibleMinutes) * 100) / 100;

  // Faltas
  const isFalta = attendance?.estado_asistencia === 'FALTA';
  const incidentReview = detail?.incident_reviews?.[0];
  const isFaltaJustified = incidentReview?.decision === 'JUSTIFICAR_INASISTENCIA';
  const isFaltaConfirmed = incidentReview?.decision === 'CONFIRMAR_FALTA';
  const isFaltaPending = isFalta && !incidentReview;

  // Horas extras
  const approvedOvertimeRequests = (detail?.overtime_requests ?? []).filter(r => r.estado === 'APROBADO');
  const approvedOvertimeMinutes = approvedOvertimeRequests.reduce((sum, r) => sum + Number(r.minutos_aprobados || 0), 0);
  const approvedOvertimeAmount = Math.round((approvedOvertimeMinutes / 60 * hourlyOvertimeRate) * 100) / 100;

  // Resolver inasistencia parcial (Tardanza)
  const handleResolvePartial = async () => {
    if (!partial || !employee || resolutionComment.trim().length < 8) return;
    setSavingResolution(true);
    try {
      const justifiedMins = partialAction === 'JUSTIFY' ? partial.missed_minutes : 0;
      const deductibleMins = partialAction === 'DEDUCT' ? partial.missed_minutes : 0;
      await rrhhService.resolvePartialAbsence(partial.attendance_id, {
        sede_id: employee.sede_id,
        justified_minutes: justifiedMins,
        compensated_minutes: 0,
        comment: resolutionComment.trim(),
      });
      showToast(
        partialAction === 'JUSTIFY'
          ? 'Tardanza justificada: no se descontará en la liquidación.'
          : `Descuento de ${formatDurationMinutes(deductibleMins)} confirmado en la liquidación.`,
        'success',
      );
      setResolutionComment('');
      await load();
      onResolved();
    } catch (err) {
      showToast(getApiErrorMessage(err, 'No se pudo resolver la tardanza.'), 'error');
    } finally {
      setSavingResolution(false);
    }
  };

  // Resolver falta
  const handleResolveFalta = async () => {
    if (!date || !employee || resolutionComment.trim().length < 8) return;
    setSavingResolution(true);
    try {
      const decision = faltaAction === 'JUSTIFY' ? 'JUSTIFICAR_INASISTENCIA' : 'CONFIRMAR_FALTA';
      await rrhhService.reviewAttendanceIncident({
        sede_id: employee.sede_id,
        employee_id: employee.id,
        date,
        incident_type: 'FALTA',
        decision,
        comment: resolutionComment.trim(),
      });
      showToast(
        faltaAction === 'JUSTIFY'
          ? 'Falta justificada: no se aplicará descuento.'
          : 'Falta confirmada: descuento registrado en la liquidación.',
        'success',
      );
      setResolutionComment('');
      await load();
      onResolved();
    } catch (err) {
      showToast(getApiErrorMessage(err, 'No se pudo registrar la resolución de la falta.'), 'error');
    } finally {
      setSavingResolution(false);
    }
  };

  if (!date || !employee) return null;

  const dayStatus = attendance?.estado_asistencia ?? 'SIN_REGISTRO';
  const statusBadgeClass = styles[`badge_${dayStatus}`] ?? styles.badge_NO_LABORABLE;

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="day-detail-title">
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <div className={styles.headerIcon}>
              <Clock3 size={20} />
            </div>
            <div>
              <h3 id="day-detail-title">{formatLongDate(date)}</h3>
              <p>{employee.nombres} {employee.apellidos} · {employee.codigo_empleado} ({employee.sede})</p>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Cerrar detalle">
            <X size={18} />
          </button>
        </header>

        <div className={styles.body}>
          {loading && !detail ? (
            <div className={styles.centerState}>
              <PageLoader compact label="Consultando marcaciones y contexto del día..." />
            </div>
          ) : error ? (
            <div className={styles.centerState}>
              <AlertTriangle size={28} color="#e11d48" />
              <p>{getApiErrorMessage(error, 'No se pudo obtener el detalle del día.')}</p>
              <Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>
            </div>
          ) : (
            <>
              {/* 1. Estado general del día */}
              <div className={styles.statusBanner}>
                <div className={styles.statusMain}>
                  <span className={`${styles.statusBadge} ${statusBadgeClass}`}>
                    {statusNames[dayStatus] ?? dayStatus}
                  </span>
                  {attendance?.minutos_tardanza && attendance.minutos_tardanza > 0 ? (
                    <strong>{formatDurationMinutes(attendance.minutos_tardanza)} tarde</strong>
                  ) : null}
                  {isFaltaJustified || (partial?.status === 'JUSTIFICADA') ? (
                    <span className={styles.justifiedChip}>
                      <ShieldCheck size={12} /> Justificada · Sin descuento
                    </span>
                  ) : null}
                </div>
                <small style={{ color: '#64748b', fontSize: '0.78rem' }}>
                  Horario: <b>{scheduleRange}</b>
                </small>
              </div>

              {/* 2. Marcaciones verificadas */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <Clock3 size={15} /> Marcaciones registradas
                </div>
                <div className={styles.scheduleStrip}>
                  <div className={styles.markBox}>
                    <small>Entrada</small>
                    <strong className={markEntrada ? '' : styles.emptyMark}>
                      {markEntrada ? formatAttendanceClock(markEntrada.hora_marcacion) : '—'}
                    </strong>
                    {markEntrada?.diferencia_programada_minutos && markEntrada.diferencia_programada_minutos > 0 ? (
                      <em>+{markEntrada.diferencia_programada_minutos} min</em>
                    ) : null}
                  </div>

                  {attendance?.almuerzo_habilitado ? (
                    <>
                      <div className={styles.markBox}>
                        <small>Salida Almuerzo</small>
                        <strong className={markAlmuerzoSalida ? '' : styles.emptyMark}>
                          {markAlmuerzoSalida ? formatAttendanceClock(markAlmuerzoSalida.hora_marcacion) : '—'}
                        </strong>
                      </div>
                      <div className={styles.markBox}>
                        <small>Regreso</small>
                        <strong className={markRegreso ? '' : styles.emptyMark}>
                          {markRegreso ? formatAttendanceClock(markRegreso.hora_marcacion) : '—'}
                        </strong>
                      </div>
                    </>
                  ) : null}

                  <div className={styles.markBox}>
                    <small>Salida</small>
                    <strong className={markSalida ? '' : styles.emptyMark}>
                      {markSalida ? formatAttendanceClock(markSalida.hora_marcacion) : '—'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* 3. Impacto Económico en la Liquidación */}
              {isFalta ? (
                <div className={`${styles.economicBox} ${isFaltaJustified ? styles.economicPositive : styles.economicNegative}`}>
                  <div className={styles.economicHeader}>
                    <div className={styles.economicTitle}>
                      <Landmark size={16} />
                      <span>Descuento por falta laboral</span>
                    </div>
                    <strong className={`${styles.economicAmount} ${isFaltaJustified ? styles.amountNeutral : styles.amountMinus}`}>
                      {isFaltaJustified ? 'S/ 0.00' : `− ${currency.format(dailyRate)}`}
                    </strong>
                  </div>
                  <p className={styles.economicDetail}>
                    {isFaltaJustified ? (
                      <>Falta justificada por administración. No se aplica descuento a su honorario mensual.</>
                    ) : isFaltaConfirmed ? (
                      <>Falta confirmada. Se descuenta el valor diario completo (<b>1 día = {currency.format(dailyRate)}</b>) en su liquidación.</>
                    ) : (
                      <>Falta pendiente de revisión. Si no se justifica, se descontará <b>{currency.format(dailyRate)}</b> de su honorario mensual.</>
                    )}
                  </p>
                </div>
              ) : hasPartialAbsence && missedMinutes > 0 ? (
                <div className={`${styles.economicBox} ${partial?.status === 'JUSTIFICADA' ? styles.economicPositive : partial?.status === 'DESCONTABLE' ? styles.economicNegative : styles.economicWarning}`}>
                  <div className={styles.economicHeader}>
                    <div className={styles.economicTitle}>
                      <ClockAlert size={16} />
                      <span>Tiempo no laborado ({formatDurationMinutes(missedMinutes)})</span>
                    </div>
                    <strong className={`${styles.economicAmount} ${partial?.status === 'JUSTIFICADA' ? styles.amountNeutral : styles.amountMinus}`}>
                      {partial?.status === 'JUSTIFICADA' ? 'S/ 0.00' : `− ${currency.format(partialDeductionAmount)}`}
                    </strong>
                  </div>
                  <p className={styles.economicDetail}>
                    {partial?.status === 'JUSTIFICADA' ? (
                      <>Tardanza de {formatDurationMinutes(missedMinutes)} justificada por administración. Sin descuento económico.</>
                    ) : partial?.status === 'DESCONTABLE' ? (
                      <>Tardanza confirmada para descuento. Se deducen <b>{currency.format(partialDeductionAmount)}</b> ({formatDurationMinutes(partialDeductibleMinutes)} a razón de {currency.format(minuteRate)}/min) en la liquidación.</>
                    ) : (
                      <>Tardanza pendiente de resolución administrativa. Representa un descuento potencial de <b>{currency.format(partialDeductionAmount)}</b> en la boleta mensual.</>
                    )}
                  </p>
                </div>
              ) : null}

              {/* 4. Horas Extras (si las hubo) */}
              {(detail?.overtime_requests ?? []).length > 0 ? (
                <div className={styles.card}>
                  <div className={styles.cardHeader}>
                    <TimerReset size={15} /> Horas extras en este día {approvedOvertimeAmount > 0 ? `(+ ${currency.format(approvedOvertimeAmount)})` : ''}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {detail?.overtime_requests.map(request => {
                      const isApproved = request.estado === 'APROBADO';
                      const reqMinutes = Number(isApproved ? request.minutos_aprobados : request.minutos_detectados);
                      const reqAmount = Math.round((reqMinutes / 60 * hourlyOvertimeRate) * 100) / 100;
                      return (
                        <div key={request.id} className={styles.overtimeCard}>
                          <div className={styles.overtimeTopline}>
                            <span className={styles.overtimeMinutes}>
                              <TimerReset size={14} />
                              {formatDurationMinutes(reqMinutes)} {isApproved ? 'aprobados' : `(${request.estado.toLowerCase()})`}
                            </span>
                            <strong className={isApproved ? styles.amountPlus : styles.amountNeutral}>
                              {isApproved ? `+ ${currency.format(reqAmount)}` : 'S/ 0.00'}
                            </strong>
                          </div>
                          {(request.comentario_revision || request.comentario_empleado) ? (
                            <p className={styles.overtimeReason}>
                              "{request.comentario_revision || request.comentario_empleado}"
                            </p>
                          ) : null}
                          {request.revisado_por_nombre ? (
                            <small style={{ color: '#6b21a8', fontSize: '0.72rem' }}>
                              Aprobado por {request.revisado_por_nombre}
                            </small>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Si todo fue normal */}
              {!isFalta && (!hasPartialAbsence || missedMinutes === 0) && (detail?.overtime_requests ?? []).length === 0 && dayStatus === 'PRESENTE' ? (
                <div className={`${styles.economicBox} ${styles.economicPositive}`}>
                  <div className={styles.economicHeader}>
                    <div className={styles.economicTitle}>
                      <CheckCircle2 size={16} color="#16a34a" />
                      <span>Jornada regular completada</span>
                    </div>
                    <strong className={`${styles.economicAmount} ${styles.amountPlus}`}>Normal</strong>
                  </div>
                  <p className={styles.economicDetail}>
                    El colaborador cumplió su horario sin incidencias ni tardanzas. Computa para su honorario mensual completo.
                  </p>
                </div>
              ) : null}

              {/* 5. Acciones de Resolución In-Situ (si el administrador puede gestionar y está pendiente) */}
              {canManage && hasPartialAbsence && partial?.status === 'PENDIENTE' ? (
                <div className={styles.resolveSection}>
                  <div className={styles.resolveHeading}>
                    <ClockAlert size={16} />
                    <span>Resolver tardanza de {formatDurationMinutes(missedMinutes)}</span>
                  </div>

                  <div className={styles.resolveButtons}>
                    <button
                      type="button"
                      className={`${styles.choiceBtn} ${partialAction === 'JUSTIFY' ? styles.choiceActiveGreen : ''}`}
                      onClick={() => setPartialAction('JUSTIFY')}
                    >
                      <CheckCircle2 size={14} /> Justificar (Sin descuento)
                    </button>
                    <button
                      type="button"
                      className={`${styles.choiceBtn} ${partialAction === 'DEDUCT' ? styles.choiceActiveRed : ''}`}
                      onClick={() => setPartialAction('DEDUCT')}
                    >
                      <AlertTriangle size={14} /> Descontar ({currency.format(partialDeductionAmount)})
                    </button>
                  </div>

                  <textarea
                    className={styles.commentInput}
                    placeholder="Escribe el motivo o sustento de la decisión (mínimo 8 letras, ej. Tráfico verificado)..."
                    value={resolutionComment}
                    onChange={e => setResolutionComment(e.target.value)}
                    maxLength={500}
                  />

                  <div className={styles.resolveFooter}>
                    <Button
                      size="sm"
                      variant="corporate"
                      icon={<FileCheck2 size={15} />}
                      loading={savingResolution}
                      disabled={savingResolution || resolutionComment.trim().length < 8}
                      onClick={() => void handleResolvePartial()}
                    >
                      Guardar decisión
                    </Button>
                  </div>
                </div>
              ) : null}

              {canManage && isFaltaPending ? (
                <div className={styles.resolveSection}>
                  <div className={styles.resolveHeading}>
                    <AlertTriangle size={16} />
                    <span>Resolver falta del día</span>
                  </div>

                  <div className={styles.resolveButtons}>
                    <button
                      type="button"
                      className={`${styles.choiceBtn} ${faltaAction === 'JUSTIFY' ? styles.choiceActiveGreen : ''}`}
                      onClick={() => setFaltaAction('JUSTIFY')}
                    >
                      <CheckCircle2 size={14} /> Justificar falta (Sin descuento)
                    </button>
                    <button
                      type="button"
                      className={`${styles.choiceBtn} ${faltaAction === 'CONFIRM' ? styles.choiceActiveRed : ''}`}
                      onClick={() => setFaltaAction('CONFIRM')}
                    >
                      <AlertTriangle size={14} /> Confirmar falta (Descontar {currency.format(dailyRate)})
                    </button>
                  </div>

                  <textarea
                    className={styles.commentInput}
                    placeholder="Motivo o sustento obligatorio de la revisión..."
                    value={resolutionComment}
                    onChange={e => setResolutionComment(e.target.value)}
                    maxLength={500}
                  />

                  <div className={styles.resolveFooter}>
                    <Button
                      size="sm"
                      variant="corporate"
                      icon={<FileCheck2 size={15} />}
                      loading={savingResolution}
                      disabled={savingResolution || resolutionComment.trim().length < 8}
                      onClick={() => void handleResolveFalta()}
                    >
                      Confirmar decisión
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
