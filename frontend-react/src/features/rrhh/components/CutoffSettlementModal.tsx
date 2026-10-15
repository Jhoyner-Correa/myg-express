import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Coins,
  FileSpreadsheet,
  FileText,
  Info,
  Landmark,
  MinusCircle,
  PlusCircle,
  Printer,
  TrendingDown,
  UserCheck,
  UserX,
  Wallet,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { rrhhService } from '../rrhh.service';
import type {
  CutoffSettlementResponse,
  ServicePaymentRow,
} from '../types';
import { employeePhotoFallbackHandler, getEmployeePhotoUrl } from './employee-avatar';
import styles from './CutoffSettlementModal.module.css';

type Props = {
  employee: ServicePaymentRow | null;
  month: string;
  canManage: boolean;
  onClose: () => void;
  onUpdated?: () => void;
};

type TabType = 'itemized' | 'attendance' | 'document';

const currency = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
});

function amount(value: number | string | null | undefined): string {
  return currency.format(Number(value || 0));
}

function formatDateDisplay(value: string | null | undefined): string {
  if (!value) return '—';
  const parts = value.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return value;
}

function getTodayLima(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
}

function getPeriodEnd(monthStr: string): string {
  const parts = monthStr.split('-').map(Number);
  const year = parts[0] ?? new Date().getFullYear();
  const monthNum = parts[1] ?? 1;
  const lastDay = new Date(year, monthNum, 0).getDate();
  return `${monthStr}-${String(lastDay).padStart(2, '0')}`;
}

export function CutoffSettlementModal({
  employee,
  month,
  canManage,
  onClose,
  onUpdated,
}: Props) {
  const periodEnd = useMemo(() => getPeriodEnd(month), [month]);
  const defaultCutoff = useMemo(() => {
    const today = getTodayLima();
    if (today < month) return `${month}-01`;
    if (today > periodEnd) return periodEnd;
    return today;
  }, [month, periodEnd]);

  const [cutoffDate, setCutoffDate] = useState<string>(defaultCutoff);
  const [activeTab, setActiveTab] = useState<TabType>('itemized');
  const [data, setData] = useState<CutoffSettlementResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<unknown>(null);

  // Termination workflow state
  const [showTerminationForm, setShowTerminationForm] = useState<boolean>(false);
  const [terminationReason, setTerminationReason] = useState<string>('RENUNCIA_VOLUNTARIA');
  const [terminationNotes, setTerminationNotes] = useState<string>('');
  const [submittingTermination, setSubmittingTermination] = useState<boolean>(false);

  // Sync cutoff date when employee or month changes
  useEffect(() => {
    setCutoffDate(defaultCutoff);
    setShowTerminationForm(false);
  }, [defaultCutoff, employee]);

  const loadCutoff = useCallback(async (targetDate: string, signal?: AbortSignal) => {
    if (!employee) return;
    setLoading(true);
    setError(null);
    try {
      const response = await rrhhService.getCutoffSettlement(
        employee.empleado_id,
        month,
        targetDate,
        signal,
      );
      setData(response);
    } catch (err) {
      if (!axios.isCancel(err)) {
        setError(err);
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [employee, month]);

  useEffect(() => {
    if (!employee) {
      setData(null);
      return;
    }
    const controller = new AbortController();
    void loadCutoff(cutoffDate, controller.signal);
    return () => controller.abort();
  }, [employee, cutoffDate, loadCutoff]);

  const handleShortcutClick = (target: string) => {
    setCutoffDate(target);
  };

  const handleTerminateEmployee = async () => {
    if (!employee || !data) return;
    setSubmittingTermination(true);
    try {
      await rrhhService.applyTerminationSettlement(employee.empleado_id, {
        fecha_cese: cutoffDate,
        motivo: terminationReason,
        observaciones: terminationNotes.trim() || undefined,
      });
      showToast('Cese laboral formalizado correctamente y liquidación actualizada.', 'success');
      setShowTerminationForm(false);
      onUpdated?.();
      void loadCutoff(cutoffDate);
    } catch (err) {
      showToast(getApiErrorMessage(err, 'No se pudo formalizar el cese del colaborador.'), 'error');
    } finally {
      setSubmittingTermination(false);
    }
  };

  if (!employee) return null;

  const fallbackEmployee = {
    id: employee.empleado_id,
    sexo: employee.sexo,
    foto: employee.foto,
  };

  const settlement = data?.settlement;
  const isTerminated = data?.employee.estado === 'INACTIVO' || Boolean(data?.employee.fecha_cese);

  // Computed metrics
  const dailyBaseFee = settlement && settlement.calendarDaysInPeriod > 0
    ? settlement.projectedMonthlyPayment / settlement.calendarDaysInPeriod
    : 0;

  const overtimeHours = settlement ? Math.floor(settlement.overtimeMinutes / 60) : 0;
  const overtimeRestMins = settlement ? settlement.overtimeMinutes % 60 : 0;
  const overtimeFormatted = overtimeHours > 0
    ? `${overtimeHours} h ${overtimeRestMins > 0 ? `${overtimeRestMins} min` : ''}`
    : `${overtimeRestMins} min`;

  return (
    <Modal
      open={Boolean(employee)}
      title="Liquidación / Corte a la Fecha de Honorarios"
      description="Cálculo proporcional exacto de haberes devengados, horas extras y deducciones a la fecha de corte seleccionada."
      icon={<FileSpreadsheet />}
      iconVariant="plain"
      maxWidth={1120}
      className={styles.modal}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="secondary"
            icon={<Printer size={16} />}
            onClick={() => {
              setActiveTab('document');
              setTimeout(() => window.print(), 150);
            }}
          >
            Imprimir Liquidación / Finiquito
          </Button>
          {canManage && !isTerminated && (
            <Button
              variant={showTerminationForm ? 'secondary' : 'danger'}
              icon={<UserX size={16} />}
              onClick={() => setShowTerminationForm(prev => !prev)}
            >
              {showTerminationForm ? 'Ocultar Cese' : 'Formalizar Cese Laboral'}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </>
      }
    >
      <div className={styles.content}>
        {/* Employee Header */}
        <section className={styles.employeeHeader}>
          <div className={styles.employeeProfile}>
            <img
              src={getEmployeePhotoUrl(fallbackEmployee)}
              onError={employeePhotoFallbackHandler(fallbackEmployee)}
              alt=""
              className={styles.avatar}
            />
            <div className={styles.employeeInfo}>
              <h3>
                {data?.employee.nombres ?? employee.nombres} {data?.employee.apellidos ?? employee.apellidos}
              </h3>
              <p>
                <span>Código: <strong>{data?.employee.codigo_empleado ?? employee.codigo_empleado}</strong></span> ·{' '}
                <span>DNI: <strong>{data?.employee.dni ?? employee.dni ?? '—'}</strong></span> ·{' '}
                <span>Cargo: <strong>{data?.employee.cargo ?? employee.cargo}</strong></span> ·{' '}
                <span>Sede: <strong>{data?.employee.sede ?? employee.sede}</strong></span>
              </p>
            </div>
          </div>
          <div>
            {isTerminated ? (
              <span className={styles.statusBadgeInactive}>
                <UserX size={13} /> Cese Registrado: {formatDateDisplay(data?.employee.fecha_cese)}
              </span>
            ) : (
              <span className={styles.statusBadgeActive}>
                <UserCheck size={13} /> Colaborador Activo
              </span>
            )}
          </div>
        </section>

        {/* Date Selector Toolbar */}
        <section className={styles.cutoffToolbar}>
          <div className={styles.cutoffControl}>
            <Calendar size={18} color="#0284c7" />
            <div className={styles.cutoffLabel}>
              <span>Fecha de Corte del Cálculo</span>
              <strong>{formatDateDisplay(cutoffDate)}</strong>
            </div>
            <input
              type="date"
              className={styles.cutoffInput}
              min={`${month}-01`}
              max={periodEnd}
              value={cutoffDate}
              onChange={e => setCutoffDate(e.target.value)}
            />
          </div>
          <div className={styles.cutoffShortcuts}>
            <button
              type="button"
              className={`${styles.shortcutBtn} ${cutoffDate === defaultCutoff ? styles.shortcutBtnActive : ''}`}
              onClick={() => handleShortcutClick(defaultCutoff)}
            >
              Hoy ({formatDateDisplay(defaultCutoff).slice(0, 5)})
            </button>
            <button
              type="button"
              className={`${styles.shortcutBtn} ${cutoffDate === `${month}-15` ? styles.shortcutBtnActive : ''}`}
              onClick={() => handleShortcutClick(`${month}-15`)}
            >
              Quincena (Día 15)
            </button>
            <button
              type="button"
              className={`${styles.shortcutBtn} ${cutoffDate === periodEnd ? styles.shortcutBtnActive : ''}`}
              onClick={() => handleShortcutClick(periodEnd)}
            >
              Cierre de Mes ({formatDateDisplay(periodEnd).slice(0, 5)})
            </button>
          </div>
        </section>

        {/* Formula Explanation Callout */}
        {settlement && (
          <div className={styles.formulaBanner}>
            <Info size={16} style={{ flexShrink: 0 }} />
            <span>
              <strong>Fórmula de liquidación proporcional:</strong> Honorario pactado de{' '}
              <strong>{amount(settlement.projectedMonthlyPayment)}</strong> ÷{' '}
              <strong>{settlement.calendarDaysInPeriod} días</strong> del mes ={' '}
              <strong>{amount(dailyBaseFee)} diario</strong> ×{' '}
              <strong>{settlement.serviceDaysToCutoff} días</strong> laborados al corte ={' '}
              <strong>{amount(settlement.accruedBaseAmount)}</strong> de honorario devengado.
            </span>
          </div>
        )}

        {/* Termination Form if toggled */}
        {showTerminationForm && canManage && (
          <section className={styles.terminationPanel}>
            <div className={styles.terminationHeader}>
              <UserX size={18} />
              <h4>Formalizar Retiro / Cese del Colaborador</h4>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: '#be123c' }}>
              Esta acción actualizará la fecha de cese al <strong>{formatDateDisplay(cutoffDate)}</strong>,
              marcará al colaborador como INACTIVO y recalculará automáticamente su liquidación mensual.
            </p>
            <div className={styles.terminationForm}>
              <label>
                <span>Motivo del Cese</span>
                <select
                  value={terminationReason}
                  onChange={e => setTerminationReason(e.target.value)}
                >
                  <option value="RENUNCIA_VOLUNTARIA">Renuncia Voluntaria</option>
                  <option value="TERMINO_CONTRATO">Término de Contrato / Servicios</option>
                  <option value="MUTUO_DISENSO">Mutuo Disenso</option>
                  <option value="DESPIDO_JUSTIFICADO">Despido Justificado</option>
                  <option value="OTRO">Otro Motivo</option>
                </select>
              </label>
              <label>
                <span>Fecha Oficial de Cese</span>
                <input type="text" readOnly value={cutoffDate} style={{ background: '#f8fafc' }} />
              </label>
              <label>
                <span>Observaciones Administrativas</span>
                <textarea
                  placeholder="Detalles sobre entrega de cargo, herramientas, uniforme o constancias..."
                  value={terminationNotes}
                  onChange={e => setTerminationNotes(e.target.value)}
                />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowTerminationForm(false)}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={<CheckCircle2 size={14} />}
                loading={submittingTermination}
                onClick={() => void handleTerminateEmployee()}
              >
                Confirmar Cese Definitivo
              </Button>
            </div>
          </section>
        )}

        {/* Loading / Error States */}
        {loading && !data ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Calculando liquidación exacta al {formatDateDisplay(cutoffDate)}…</p>
          </div>
        ) : error ? (
          <div className={styles.errorState}>
            <AlertTriangle size={32} color="#dc2626" />
            <strong>No se pudo calcular la liquidación a la fecha</strong>
            <p>{getApiErrorMessage(error, 'Intenta seleccionando otra fecha de corte.')}</p>
            <Button variant="secondary" onClick={() => void loadCutoff(cutoffDate)}>
              Reintentar
            </Button>
          </div>
        ) : settlement ? (
          <>
            {/* KPI Cards Banner */}
            <section className={styles.kpiGrid}>
              <div className={`${styles.kpiCard} ${styles.kpiIncome}`}>
                <div className={styles.kpiHeader}>
                  <span>Honorario Devengado</span>
                  <Wallet size={15} />
                </div>
                <div className={styles.kpiValue}>
                  {amount(settlement.accruedBaseAmount)}
                </div>
                <div className={styles.kpiSubtext}>
                  {settlement.serviceDaysToCutoff} de {settlement.calendarDaysInPeriod} días ({amount(dailyBaseFee)}/día)
                </div>
                <span className={styles.kpiTag}>Pactado: {amount(settlement.projectedMonthlyPayment)}</span>
              </div>

              <div className={`${styles.kpiCard} ${styles.kpiOvertime}`}>
                <div className={styles.kpiHeader}>
                  <span>Horas Extra (+)</span>
                  <Clock size={15} />
                </div>
                <div className={styles.kpiValue}>
                  + {amount(settlement.overtimeAmount)}
                </div>
                <div className={styles.kpiSubtext}>
                  {overtimeFormatted} ({settlement.overtimeMinutes} min a {amount(settlement.overtimeHourlyRate)}/h)
                </div>
                <span className={styles.kpiTag}>Aprobadas en sistema</span>
              </div>

              <div className={`${styles.kpiCard} ${styles.kpiDeduction}`}>
                <div className={styles.kpiHeader}>
                  <span>Faltas y Tardanzas (-)</span>
                  <TrendingDown size={15} />
                </div>
                <div className={styles.kpiValue}>
                  − {amount(settlement.absenceDiscountAmount + settlement.partialAbsenceDiscountAmount)}
                </div>
                <div className={styles.kpiSubtext}>
                  {settlement.confirmedAbsences} falta(s) · {settlement.partialAbsenceMinutes} min tardanza
                </div>
                <span className={styles.kpiTag}>Deducibles a la fecha</span>
              </div>

              <div className={`${styles.kpiCard} ${styles.kpiDeduction}`}>
                <div className={styles.kpiHeader}>
                  <span>Adelantos & Préstamos (-)</span>
                  <Landmark size={15} />
                </div>
                <div className={styles.kpiValue}>
                  − {amount(settlement.advancesAmount + settlement.loanInstallmentsAmount)}
                </div>
                <div className={styles.kpiSubtext}>
                  {settlement.advancesAmount > 0 ? `${amount(settlement.advancesAmount)} adelanto` : 'Sin adelanto'}
                  {settlement.loanInstallmentsAmount > 0 ? `, ${amount(settlement.loanInstallmentsAmount)} préstamo` : ''}
                </div>
                <span className={styles.kpiTag}>Retenciones aplicadas</span>
              </div>

              <div className={`${styles.kpiCard} ${styles.kpiNet}`}>
                <div className={styles.kpiHeader}>
                  <span>TOTAL NETO A LIQUIDAR</span>
                  <Coins size={16} />
                </div>
                <div className={styles.kpiValue}>
                  {amount(settlement.netSettlementAmount)}
                </div>
                <div className={styles.kpiSubtext} style={{ color: '#065f46', fontWeight: 700 }}>
                  Abono exacto al {formatDateDisplay(cutoffDate)}
                </div>
                <span className={styles.kpiTag} style={{ background: '#dcfce7', color: '#15803d' }}>
                  Bruto {amount(settlement.grossServiceAmount)} − Deducciones {amount(settlement.totalDeductionsAmount)}
                </span>
              </div>
            </section>

            {/* Navigation Tabs */}
            <nav className={styles.tabs}>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === 'itemized' ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveTab('itemized')}
              >
                <FileSpreadsheet size={15} />
                Resumen y Desglose Financiero
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === 'attendance' ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveTab('attendance')}
              >
                <Clock size={15} />
                Marcaciones y Asistencias a la Fecha ({data.daily_attendances.length} días)
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === 'document' ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveTab('document')}
              >
                <FileText size={15} />
                Hoja de Liquidación / Finiquito (Imprimible)
              </button>
            </nav>

            {/* Tab: Resumen y Desglose Financiero (Two Parallel Tables) */}
            {activeTab === 'itemized' && (
              <>
                <section className={styles.breakdownSection}>
                  {/* Incomes Card */}
                  <article className={styles.breakdownCard}>
                    <div className={styles.breakdownHeader}>
                      <strong>
                        <PlusCircle size={15} color="#059669" />
                        1. Haberes e Ingresos Devengados
                      </strong>
                      <span className={styles.conceptBadgeEarning}>+ INGRESOS</span>
                    </div>
                    <table className={styles.breakdownTable}>
                      <thead>
                        <tr>
                          <th>Concepto</th>
                          <th>Detalle de Cálculo</th>
                          <th style={{ textAlign: 'right' }}>Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>
                            <strong>Honorario base devengado</strong>
                          </td>
                          <td style={{ color: '#64748b', fontSize: '11px' }}>
                            {settlement.serviceDaysToCutoff} de {settlement.calendarDaysInPeriod} días (Tarifa {amount(dailyBaseFee)}/día)
                          </td>
                          <td className={styles.amountAdd}>
                            + {amount(settlement.accruedBaseAmount)}
                          </td>
                        </tr>

                        {settlement.overtimeAmount > 0 && (
                          <tr>
                            <td>
                              <strong>Horas extras aprobadas</strong>
                            </td>
                            <td style={{ color: '#64748b', fontSize: '11px' }}>
                              {overtimeFormatted} acumuladas a tarifa {amount(settlement.overtimeHourlyRate)}/h
                            </td>
                            <td className={styles.amountAdd}>
                              + {amount(settlement.overtimeAmount)}
                            </td>
                          </tr>
                        )}

                        {settlement.otherIncome > 0 && (
                          <tr>
                            <td>
                              <strong>Bonificaciones / Otros ingresos</strong>
                            </td>
                            <td style={{ color: '#64748b', fontSize: '11px' }}>
                              Bonos vigentes a la fecha de corte
                            </td>
                            <td className={styles.amountAdd}>
                              + {amount(settlement.otherIncome)}
                            </td>
                          </tr>
                        )}

                        <tr className={styles.breakdownSubtotal}>
                          <td colSpan={2}>
                            <strong>TOTAL BRUTO DEVENGADO</strong>
                          </td>
                          <td className={styles.amountAdd} style={{ fontSize: '13px' }}>
                            <strong>+ {amount(settlement.grossServiceAmount)}</strong>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </article>

                  {/* Deductions Card */}
                  <article className={styles.breakdownCard}>
                    <div className={styles.breakdownHeader}>
                      <strong>
                        <MinusCircle size={15} color="#dc2626" />
                        2. Deducciones y Retenciones
                      </strong>
                      <span className={styles.conceptBadgeDeduction}>− DEDUCCIONES</span>
                    </div>
                    <table className={styles.breakdownTable}>
                      <thead>
                        <tr>
                          <th>Concepto</th>
                          <th>Detalle de Cálculo</th>
                          <th style={{ textAlign: 'right' }}>Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {settlement.absenceDiscountAmount > 0 && (
                          <tr>
                            <td>
                              <strong>Descuento por inasistencia</strong>
                            </td>
                            <td style={{ color: '#64748b', fontSize: '11px' }}>
                              {settlement.confirmedAbsences} falta(s) no justificada(s)
                            </td>
                            <td className={styles.amountDeduct}>
                              − {amount(settlement.absenceDiscountAmount)}
                            </td>
                          </tr>
                        )}

                        {settlement.partialAbsenceDiscountAmount > 0 && (
                          <tr>
                            <td>
                              <strong>Descuento por tardanzas</strong>
                            </td>
                            <td style={{ color: '#64748b', fontSize: '11px' }}>
                              {settlement.partialAbsenceMinutes} minutos deducibles
                            </td>
                            <td className={styles.amountDeduct}>
                              − {amount(settlement.partialAbsenceDiscountAmount)}
                            </td>
                          </tr>
                        )}

                        {settlement.advancesAmount > 0 && (
                          <tr>
                            <td>
                              <strong>Adelanto de honorarios</strong>
                            </td>
                            <td style={{ color: '#64748b', fontSize: '11px' }}>
                              Adelantos entregados en el mes
                            </td>
                            <td className={styles.amountDeduct}>
                              − {amount(settlement.advancesAmount)}
                            </td>
                          </tr>
                        )}

                        {settlement.loanInstallmentsAmount > 0 && (
                          <tr>
                            <td>
                              <strong>Cuota de préstamo</strong>
                            </td>
                            <td style={{ color: '#64748b', fontSize: '11px' }}>
                              Cuota de préstamo activo
                            </td>
                            <td className={styles.amountDeduct}>
                              − {amount(settlement.loanInstallmentsAmount)}
                            </td>
                          </tr>
                        )}

                        {settlement.otherDiscountsAmount > 0 && (
                          <tr>
                            <td>
                              <strong>Otros descuentos aplicados</strong>
                            </td>
                            <td style={{ color: '#64748b', fontSize: '11px' }}>
                              Ajustes y retenciones administrativas
                            </td>
                            <td className={styles.amountDeduct}>
                              − {amount(settlement.otherDiscountsAmount)}
                            </td>
                          </tr>
                        )}

                        {settlement.totalDeductionsAmount === 0 && (
                          <tr>
                            <td colSpan={3} className={styles.breakdownEmpty}>
                              Sin deducciones registradas hasta la fecha de corte
                            </td>
                          </tr>
                        )}

                        <tr className={styles.breakdownSubtotal}>
                          <td colSpan={2}>
                            <strong>TOTAL DEDUCCIONES</strong>
                          </td>
                          <td className={styles.amountDeduct} style={{ fontSize: '13px' }}>
                            <strong>
                              {settlement.totalDeductionsAmount > 0
                                ? `− ${amount(settlement.totalDeductionsAmount)}`
                                : amount(0)}
                            </strong>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </article>
                </section>

                {/* Consolidated Bottom Strip */}
                <section className={styles.consolidatedSummary}>
                  <div className={styles.summaryCol}>
                    <span>Total Bruto Devengado</span>
                    <strong style={{ color: '#0369a1' }}>+ {amount(settlement.grossServiceAmount)}</strong>
                  </div>
                  <div className={styles.summaryCol}>
                    <span>Total Deducciones</span>
                    <strong style={{ color: '#b91c1c' }}>− {amount(settlement.totalDeductionsAmount)}</strong>
                  </div>
                  <div className={styles.summaryNet}>
                    <span>Neto a Liquidar:</span>
                    <strong>{amount(settlement.netSettlementAmount)}</strong>
                  </div>
                </section>
              </>
            )}

            {/* Tab: Attendance Log */}
            {activeTab === 'attendance' && (
              <div className={styles.attendanceCard}>
                <table className={styles.attendanceTable}>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Estado de Asistencia</th>
                      <th>Tipo</th>
                      <th>Tardanza Ingreso</th>
                      <th>Tardanza Retorno</th>
                      <th>Horas Extra Aprobadas</th>
                      <th>Justificación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily_attendances.map(row => (
                      <tr key={row.fecha}>
                        <td>
                          <strong>{formatDateDisplay(row.fecha)}</strong>
                        </td>
                        <td>
                          <span
                            className={`${styles.statusPill} ${
                              row.estado_asistencia === 'PRESENTE'
                                ? styles.statusPresent
                                : row.estado_asistencia === 'TARDANZA'
                                ? styles.statusLate
                                : row.estado_asistencia === 'FALTA'
                                ? styles.statusAbsent
                                : styles.statusHoliday
                            }`}
                          >
                            {row.estado_asistencia}
                          </span>
                        </td>
                        <td style={{ fontSize: '11px', color: '#64748b' }}>{row.tipo_asistencia}</td>
                        <td>
                          {row.minutos_tardanza > 0 ? (
                            <span style={{ color: '#b45309', fontWeight: 700 }}>
                              {row.minutos_tardanza} min
                            </span>
                          ) : (
                            '0 min'
                          )}
                        </td>
                        <td>
                          {row.minutos_tardanza_retorno > 0 ? (
                            <span style={{ color: '#b45309', fontWeight: 700 }}>
                              {row.minutos_tardanza_retorno} min
                            </span>
                          ) : (
                            '0 min'
                          )}
                        </td>
                        <td>
                          {row.minutos_horas_extra > 0 ? (
                            <span style={{ color: '#7e22ce', fontWeight: 800 }}>
                              {Math.floor(row.minutos_horas_extra / 60) > 0 ? `${Math.floor(row.minutos_horas_extra / 60)}h ` : ''}
                              {row.minutos_horas_extra % 60}m ({row.minutos_horas_extra} min)
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td style={{ fontSize: '11px', color: '#475569' }}>
                          {row.justificacion_estado ? (
                            <span>
                              {row.justificacion_estado} ({row.justificacion_motivo || 'Sin detalle'})
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab: Printable Document */}
            {activeTab === 'document' && (
              <article className={styles.printableDocument}>
                <header className={styles.docLetterhead}>
                  <div className={styles.docCompany}>
                    <strong>MYG EXPRESS LOGÍSTICA & DISTRIBUCIÓN S.A.C.</strong>
                    <span>R.U.C. N° 20601234567 · Gestión de Recursos Humanos</span>
                    <span>Sede Operativa: {data.employee.sede}</span>
                  </div>
                  <div className={styles.docTitle}>
                    <h2>Liquidación de Cese / Finiquito de Honorarios</h2>
                    <span>Fecha de Emisión: {formatDateDisplay(getTodayLima())}</span>
                  </div>
                </header>

                <div className={styles.docMetaGrid}>
                  <div className={styles.docMetaItem}>
                    <span>Colaborador</span>
                    <strong>{data.employee.nombres} {data.employee.apellidos}</strong>
                  </div>
                  <div className={styles.docMetaItem}>
                    <span>D.N.I.</span>
                    <strong>{data.employee.dni || '—'}</strong>
                  </div>
                  <div className={styles.docMetaItem}>
                    <span>Cargo</span>
                    <strong>{data.employee.cargo}</strong>
                  </div>
                  <div className={styles.docMetaItem}>
                    <span>Código Empleado</span>
                    <strong>{data.employee.codigo_empleado}</strong>
                  </div>
                  <div className={styles.docMetaItem}>
                    <span>Fecha de Ingreso</span>
                    <strong>{formatDateDisplay(data.employee.fecha_ingreso)}</strong>
                  </div>
                  <div className={styles.docMetaItem}>
                    <span>Fecha de Cese / Corte</span>
                    <strong style={{ color: '#0369a1' }}>{formatDateDisplay(cutoffDate)}</strong>
                  </div>
                  <div className={styles.docMetaItem}>
                    <span>Banco de Abono</span>
                    <strong>{data.employee.banco || 'No registrado'}</strong>
                  </div>
                  <div className={styles.docMetaItem}>
                    <span>N° Cuenta / CCI</span>
                    <strong>
                      {data.employee.numero_cuenta_ultimos4
                        ? `•••• ${data.employee.numero_cuenta_ultimos4}`
                        : '—'}
                    </strong>
                  </div>
                </div>

                <div className={styles.docTablesRow}>
                  {/* Incomes Table */}
                  <div className={styles.docTableCard}>
                    <div className={styles.docTableHeader}>1. Haberes Devengados e Ingresos</div>
                    <table className={styles.docTable}>
                      <tbody>
                        <tr>
                          <td>
                            Honorario Base Devengado
                            <br />
                            <small style={{ color: '#64748b' }}>
                              {settlement.serviceDaysToCutoff} de {settlement.calendarDaysInPeriod} días ({amount(dailyBaseFee)}/día)
                            </small>
                          </td>
                          <td className={styles.docTableNum}>{amount(settlement.accruedBaseAmount)}</td>
                        </tr>
                        {settlement.overtimeAmount > 0 && (
                          <tr>
                            <td>
                              Horas Extras Aprobadas
                              <br />
                              <small style={{ color: '#64748b' }}>
                                {overtimeFormatted} a {amount(settlement.overtimeHourlyRate)}/h
                              </small>
                            </td>
                            <td className={styles.docTableNum}>{amount(settlement.overtimeAmount)}</td>
                          </tr>
                        )}
                        {settlement.otherIncome > 0 && (
                          <tr>
                            <td>Otros Ingresos / Bonos</td>
                            <td className={styles.docTableNum}>{amount(settlement.otherIncome)}</td>
                          </tr>
                        )}
                        <tr className={styles.docTableSubtotal}>
                          <td><strong>Total Bruto Devengado</strong></td>
                          <td className={styles.docTableNum}>
                            <strong>{amount(settlement.grossServiceAmount)}</strong>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Deductions Table */}
                  <div className={styles.docTableCard}>
                    <div className={styles.docTableHeader}>2. Deducciones y Retenciones</div>
                    <table className={styles.docTable}>
                      <tbody>
                        {settlement.absenceDiscountAmount > 0 && (
                          <tr>
                            <td>
                              Descuento por Inasistencias
                              <br />
                              <small style={{ color: '#64748b' }}>
                                {settlement.confirmedAbsences} falta(s) no justificada(s)
                              </small>
                            </td>
                            <td className={styles.docTableNum}>− {amount(settlement.absenceDiscountAmount)}</td>
                          </tr>
                        )}
                        {settlement.partialAbsenceDiscountAmount > 0 && (
                          <tr>
                            <td>
                              Descuento por Tardanzas
                              <br />
                              <small style={{ color: '#64748b' }}>
                                {settlement.partialAbsenceMinutes} minutos deducibles
                              </small>
                            </td>
                            <td className={styles.docTableNum}>− {amount(settlement.partialAbsenceDiscountAmount)}</td>
                          </tr>
                        )}
                        {settlement.advancesAmount > 0 && (
                          <tr>
                            <td>Adelanto de Honorarios / Quincena</td>
                            <td className={styles.docTableNum}>− {amount(settlement.advancesAmount)}</td>
                          </tr>
                        )}
                        {settlement.loanInstallmentsAmount > 0 && (
                          <tr>
                            <td>Cuota de Préstamo Corporativo</td>
                            <td className={styles.docTableNum}>− {amount(settlement.loanInstallmentsAmount)}</td>
                          </tr>
                        )}
                        {settlement.otherDiscountsAmount > 0 && (
                          <tr>
                            <td>Otros Descuentos Administrativos</td>
                            <td className={styles.docTableNum}>− {amount(settlement.otherDiscountsAmount)}</td>
                          </tr>
                        )}
                        {settlement.totalDeductionsAmount === 0 && (
                          <tr>
                            <td colSpan={2} style={{ color: '#94a3b8', fontStyle: 'italic', textAlign: 'center' }}>
                              Sin deducciones aplicables a la fecha de corte
                            </td>
                          </tr>
                        )}
                        <tr className={styles.docTableSubtotal}>
                          <td><strong>Total Deducciones</strong></td>
                          <td className={styles.docTableNum}>
                            <strong>
                              {settlement.totalDeductionsAmount > 0
                                ? `− ${amount(settlement.totalDeductionsAmount)}`
                                : amount(0)}
                            </strong>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className={styles.docGrandTotal}>
                  <span>Monto Neto Total a Percibir:</span>
                  <strong>{amount(settlement.netSettlementAmount)}</strong>
                </div>

                <div className={styles.docConformity}>
                  <strong>CONSTANCIA DE CONFORMIDAD:</strong> El colaborador abajo firmante deja expresa constancia
                  de haber revisado y recibido a su entera satisfacción la liquidación de sus honorarios y servicios
                  prestados a <strong>MYG EXPRESS LOGÍSTICA & DISTRIBUCIÓN S.A.C.</strong> hasta el día{' '}
                  <strong>{formatDateDisplay(cutoffDate)}</strong>, declarando que no existe reclamo ni adeudo
                  pendiente de pago alguno derivado de la presente relación contractual por los conceptos aquí detallados.
                </div>

                <div className={styles.docSignatures}>
                  <div className={styles.docSignBox}>
                    <div className={styles.docSignLine} />
                    <strong>{data.employee.nombres} {data.employee.apellidos}</strong>
                    <span>DNI: {data.employee.dni || '—'}</span>
                    <span>Colaborador (Firma y Huella)</span>
                  </div>
                  <div className={styles.docSignBox}>
                    <div className={styles.docSignLine} />
                    <strong>Gestión de Recursos Humanos</strong>
                    <span>Revisado y Conforme</span>
                  </div>
                  <div className={styles.docSignBox}>
                    <div className={styles.docSignLine} />
                    <strong>Gerencia de Administración</strong>
                    <span>Autorización y Archivo</span>
                  </div>
                </div>
              </article>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
