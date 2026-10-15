import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  FileSpreadsheet,
  FileText,
  Landmark,
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
      showToast('Cese laboral formalizado correctamente.', 'success');
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

  return (
    <Modal
      open={Boolean(employee)}
      title="Liquidación / Corte a la Fecha de Honorarios"
      description="Cálculo dinámico en tiempo real de haberes devengados, sobretiempo y descuentos a una fecha de corte específica."
      icon={<FileSpreadsheet />}
      iconVariant="plain"
      maxWidth={1080}
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
                <span>{data?.employee.codigo_empleado ?? employee.codigo_empleado}</span> ·{' '}
                <span>{data?.employee.cargo ?? employee.cargo}</span> ·{' '}
                <span>{data?.employee.sede ?? employee.sede}</span>
              </p>
            </div>
          </div>
          <div>
            {isTerminated ? (
              <span className={styles.statusBadgeInactive}>
                <UserX size={12} /> Cesado el {formatDateDisplay(data?.employee.fecha_cese)}
              </span>
            ) : (
              <span className={styles.statusBadgeActive}>
                <UserCheck size={12} /> Colaborador Activo
              </span>
            )}
          </div>
        </section>

        {/* Date Selector Toolbar */}
        <section className={styles.cutoffToolbar}>
          <div className={styles.cutoffControl}>
            <Calendar size={18} color="#0284c7" />
            <div className={styles.cutoffLabel}>
              <span>Fecha de Corte / Liquidación</span>
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
              Fin de Mes
            </button>
          </div>
        </section>

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
                  placeholder="Detalles sobre entrega de cargo, herramientas o constancias..."
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
            {/* KPI Banner */}
            <section className={styles.kpiGrid}>
              <div className={`${styles.kpiCard} ${styles.kpiIncome}`}>
                <div className={styles.kpiHeader}>
                  <span>Honorario Base</span>
                  <Wallet size={15} />
                </div>
                <div className={styles.kpiValue}>
                  {amount(settlement.accruedBaseAmount)}
                </div>
                <div className={styles.kpiSubtext}>
                  {settlement.serviceAccruedDays} de {settlement.calendarDaysInMonth} días ({amount(settlement.dailyBaseFee)}/día)
                </div>
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
                  {Math.round(settlement.payableOvertimeMinutes / 60 * 10) / 10}h ({settlement.payableOvertimeMinutes} min a {amount(settlement.overtimeHourlyRate)}/h)
                </div>
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
                  {settlement.confirmedAbsenceCount} falta(s), {settlement.partialAbsenceMinutes} min tardanza
                </div>
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
              </div>

              <div className={`${styles.kpiCard} ${styles.kpiNet}`}>
                <div className={styles.kpiHeader}>
                  <span>TOTAL NETO A LIQUIDAR</span>
                  <DollarSign size={16} />
                </div>
                <div className={styles.kpiValue}>
                  {amount(settlement.netSettlementAmount)}
                </div>
                <div className={styles.kpiSubtext} style={{ color: '#065f46', fontWeight: 700 }}>
                  Abono exacto al {formatDateDisplay(cutoffDate)}
                </div>
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
                Desglose Itemizado de Conceptos
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === 'attendance' ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveTab('attendance')}
              >
                <Clock size={15} />
                Asistencias y Marcaciones ({data.daily_attendances.length} días)
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

            {/* Tab: Itemized Concept Breakdown */}
            {activeTab === 'itemized' && (
              <div className={styles.itemizedCard}>
                <table className={styles.itemizedTable}>
                  <thead>
                    <tr>
                      <th style={{ width: '130px' }}>Tipo</th>
                      <th>Concepto</th>
                      <th>Detalle y Fórmula</th>
                      <th style={{ textAlign: 'right', width: '140px' }}>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlement.itemizedLines.map((line, idx) => (
                      <tr key={`item-${idx}`}>
                        <td>
                          <span
                            className={`${styles.conceptBadge} ${
                              line.type === 'BASE'
                                ? styles.conceptBase
                                : line.type === 'HORAS_EXTRA'
                                ? styles.conceptOvertime
                                : line.type === 'OTRO_INGRESO'
                                ? styles.conceptBonus
                                : line.type === 'ADELANTO'
                                ? styles.conceptAdvance
                                : line.type === 'PRESTAMO'
                                ? styles.conceptLoan
                                : styles.conceptDeduction
                            }`}
                          >
                            {line.type.replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <strong>{line.concept}</strong>
                        </td>
                        <td style={{ color: '#64748b', fontSize: '11.5px' }}>{line.details}</td>
                        <td className={line.impact === 'ADD' ? styles.impactAdd : styles.impactDeduct}>
                          {line.impact === 'ADD' ? '+ ' : '− '}
                          {amount(line.amount)}
                        </td>
                      </tr>
                    ))}
                    <tr className={styles.tableTotalRow}>
                      <td colSpan={3}>
                        <strong>TOTAL NETO A DEPOSITAR AL CORTE</strong>
                      </td>
                      <td style={{ textAlign: 'right', color: '#047857', fontSize: '14px' }}>
                        <strong>{amount(settlement.netSettlementAmount)}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab: Attendance Log */}
            {activeTab === 'attendance' && (
              <div className={styles.itemizedCard}>
                <table className={styles.attendanceTable}>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Estado</th>
                      <th>Tipo</th>
                      <th>Tardanza</th>
                      <th>Horas Extra</th>
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
                            '—'
                          )}
                        </td>
                        <td>
                          {row.minutos_horas_extra > 0 ? (
                            <span style={{ color: '#7e22ce', fontWeight: 700 }}>
                              {row.minutos_horas_extra} min
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
                    <span>Sede Central / Operativa: {data.employee.sede}</span>
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
                              {settlement.serviceAccruedDays} de {settlement.calendarDaysInMonth} días ({amount(settlement.dailyBaseFee)}/día)
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
                                {settlement.payableOvertimeMinutes} min a {amount(settlement.overtimeHourlyRate)}/h
                              </small>
                            </td>
                            <td className={styles.docTableNum}>{amount(settlement.overtimeAmount)}</td>
                          </tr>
                        )}
                        {settlement.otherIncomeAmount > 0 && (
                          <tr>
                            <td>Otros Ingresos / Bonos</td>
                            <td className={styles.docTableNum}>{amount(settlement.otherIncomeAmount)}</td>
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
                                {settlement.confirmedAbsenceCount} falta(s) injustificada(s)
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
