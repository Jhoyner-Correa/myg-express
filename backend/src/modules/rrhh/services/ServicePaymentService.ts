import { createCipheriv, createHash, randomBytes } from 'crypto';
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../../../core/database/database';
import { businessDate } from '../../../core/utils/time';
import {
  calculateMonthlyAgreementBase, calculateServicePayment, classifyPaymentWorkQueue,
  evaluatePaymentControls, MonthlyProrationPolicy, normalizePaymentMonth,
  parsePaymentAmount, planPaymentAgreementWrite,
} from '../domain/paymentDomain';

export class ServicePaymentError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'ServicePaymentError';
  }
}

function positiveId(value: unknown, label: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new ServicePaymentError(`${label} no valido.`);
  return id;
}

function amount(value: unknown, label: string, allowZero = true): number {
  const parsed = parsePaymentAmount(value);
  if (!Number.isFinite(parsed) || parsed < (allowZero ? 0 : 0.01) || parsed > 9_999_999.99) {
    throw new ServicePaymentError(`${label} no valido.`);
  }
  return Math.round(parsed * 100) / 100;
}

function text(value: unknown, label: string, max = 160): string {
  const parsed = String(value ?? '').trim();
  if (!parsed || parsed.length > max) throw new ServicePaymentError(`${label} no valido.`);
  return parsed;
}

function prorationPolicy(value: unknown): MonthlyProrationPolicy {
  const policy = String(value ?? 'DIAS_CALENDARIO').trim().toUpperCase();
  if (!['DIAS_CALENDARIO', 'HONORARIO_COMPLETO'].includes(policy)) {
    throw new ServicePaymentError('Politica para periodos parciales no valida.');
  }
  return policy as MonthlyProrationPolicy;
}

function agreementSegments(rows: RowDataPacket[]) {
  return rows.map(row => ({
    agreementId: Number(row.id),
    monthlyPayment: Number(row.pago_mensual || 0),
    agreementStart: String(row.vigente_desde_fecha),
    agreementEnd: row.vigente_hasta_fecha ? String(row.vigente_hasta_fecha) : null,
    policy: prorationPolicy(row.politica_prorrateo),
  }));
}

function optionalDigits(value: unknown, min: number, max: number): string | null {
  const parsed = String(value ?? '').replace(/\s+/g, '');
  if (!parsed) return null;
  if (!/^\d+$/.test(parsed) || parsed.length < min || parsed.length > max) {
    throw new ServicePaymentError('Los datos de la cuenta bancaria no son validos.');
  }
  return parsed;
}

function encryptSensitive(value: string | null): string | null {
  if (!value) return null;
  const secret = process.env.PAYMENTS_DATA_ENCRYPTION_KEY
    || (process.env.NODE_ENV === 'production' ? undefined : process.env.JWT_SECRET);
  if (!secret) throw new ServicePaymentError('Falta configurar la clave de proteccion de datos bancarios.', 503);
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}

function periodEnd(period: string): string {
  const date = new Date(`${period}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

function paymentControls(row: RowDataPacket, hasLiquidation: boolean) {
  return evaluatePaymentControls({
    hasAgreement: Boolean(row.acuerdo_configurado_id),
    hasLiquidation,
    overtimeMinutes: Number(row.minutos_horas_extra || 0),
    overtimeHourlyRate: Number(row.tarifa_hora_extra || 0),
    bank: row.banco ? String(row.banco) : null,
    accountLast4: row.numero_cuenta_ultimos4 ? String(row.numero_cuenta_ultimos4) : null,
    serviceTotal: Number(row.total_servicio || 0),
    depositTotal: Number(row.total_depositar || 0),
    liquidationStatus: row.estado ? String(row.estado) : null,
    receiptSeries: row.rhe_serie ? String(row.rhe_serie) : null,
    receiptNumber: row.rhe_numero ? String(row.rhe_numero) : null,
    receiptAmount: row.rhe_importe === null || row.rhe_importe === undefined ? null : Number(row.rhe_importe),
    paymentOperation: row.pago_operacion ? String(row.pago_operacion) : null,
  });
}

export class ServicePaymentService {
  async resolveCompanyId(companyId: number | null): Promise<number> {
    if (companyId) return positiveId(companyId, 'Empresa');
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT id FROM empresas WHERE estado = 'ACTIVA' ORDER BY id LIMIT 2`);
    if (rows.length !== 1) throw new ServicePaymentError('Selecciona una empresa para administrar sus pagos.', 409);
    return Number(rows[0].id);
  }

  async dashboard(companyIdValue: number | null, siteIdValue: unknown, monthValue: unknown) {
    const companyId = await this.resolveCompanyId(companyIdValue);
    const period = normalizePaymentMonth(monthValue);
    const siteId = siteIdValue === undefined || siteIdValue === null || siteIdValue === ''
      ? null : positiveId(siteIdValue, 'Sede');
    if (siteId) await this.assertSite(companyId, siteId);

    const [periodRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, estado, periodo, enviado_revision_en, aprobado_en, cerrado_en, observacion, created_at, updated_at
         FROM personal_periodos_pago WHERE empresa_id = ? AND periodo = ? LIMIT 1`,
      [companyId, period],
    );
    const paymentPeriod = periodRows[0] ?? null;
    const values: unknown[] = [companyId];
    let siteFilter = '';
    if (siteId) { siteFilter = ' AND employee.sede_id = ?'; values.push(siteId); }

    let rows: RowDataPacket[];
    if (paymentPeriod) {
      const [result] = await pool.query<RowDataPacket[]>(
        `SELECT liquidation.id, liquidation.empleado_id, liquidation.sede_id,
                liquidation.acuerdo_id AS acuerdo_configurado_id,
                employee.codigo_empleado, employee.dni, employee.nombres, employee.apellidos, employee.sexo, employee.foto,
                role.nombre AS cargo, site.nombre AS sede,
                liquidation.pago_mensual, liquidation.honorario_mensual_pactado,
                liquidation.politica_prorrateo, liquidation.prorrateo_aplicado,
                liquidation.dias_periodo, liquidation.dias_servicio,
                DATE_FORMAT(liquidation.fecha_servicio_desde, '%Y-%m-%d') AS fecha_servicio_desde,
                DATE_FORMAT(liquidation.fecha_servicio_hasta, '%Y-%m-%d') AS fecha_servicio_hasta,
                liquidation.factor_prorrateo,
                liquidation.minutos_horas_extra, liquidation.monto_horas_extra,
                liquidation.otros_ingresos, liquidation.adelantos, liquidation.cuotas_prestamo,
                liquidation.otros_descuentos, liquidation.total_servicio, liquidation.total_depositar,
                liquidation.estado, liquidation.rhe_serie, liquidation.rhe_numero,
                liquidation.rhe_fecha_emision, liquidation.rhe_importe, liquidation.pago_fecha, liquidation.pago_operacion,
                agreement.tarifa_hora_extra, agreement.banco, agreement.tipo_cuenta, agreement.numero_cuenta_ultimos4,
                agreement.cci_ultimos4,
                active_agreement.id AS acuerdo_actual_id,
                active_agreement.pago_mensual AS acuerdo_actual_pago_mensual,
                active_agreement.politica_prorrateo AS acuerdo_actual_politica_prorrateo,
                active_agreement.tarifa_hora_extra AS acuerdo_actual_tarifa_hora_extra,
                active_agreement.banco AS acuerdo_actual_banco,
                active_agreement.tipo_cuenta AS acuerdo_actual_tipo_cuenta,
                active_agreement.numero_cuenta_ultimos4 AS acuerdo_actual_numero_cuenta_ultimos4,
                active_agreement.cci_ultimos4 AS acuerdo_actual_cci_ultimos4,
                DATE_FORMAT(active_agreement.vigente_desde, '%Y-%m-%d') AS acuerdo_actual_vigente_desde,
                DATE_FORMAT(active_agreement.vigente_hasta, '%Y-%m-%d') AS acuerdo_actual_vigente_hasta,
                liquidation.observacion
           FROM personal_liquidaciones_pago liquidation
           INNER JOIN personal_periodos_pago payment_period ON payment_period.id = liquidation.periodo_pago_id
           INNER JOIN personal_empleados employee ON employee.id = liquidation.empleado_id
           INNER JOIN personal_cargos role ON role.id = employee.cargo_id
           INNER JOIN sedes site ON site.id = liquidation.sede_id
           LEFT JOIN personal_pago_acuerdos agreement ON agreement.id = liquidation.acuerdo_id
           LEFT JOIN personal_pago_acuerdos active_agreement ON active_agreement.id = (
             SELECT latest_agreement.id FROM personal_pago_acuerdos latest_agreement
              WHERE latest_agreement.empleado_id = employee.id AND latest_agreement.vigente_hasta IS NULL
              ORDER BY latest_agreement.vigente_desde DESC, latest_agreement.id DESC LIMIT 1
           )
          WHERE payment_period.empresa_id = ? AND payment_period.periodo = ?
            ${siteId ? 'AND liquidation.sede_id = ?' : ''}
          ORDER BY site.nombre, employee.apellidos, employee.nombres`,
        siteId ? [companyId, period, siteId] : [companyId, period],
      );
      rows = result;
    } else {
      const [result] = await pool.query<RowDataPacket[]>(
        `SELECT NULL AS id, employee.id AS empleado_id, employee.sede_id,
                agreement.id AS acuerdo_configurado_id,
                employee.codigo_empleado, employee.dni, employee.nombres, employee.apellidos, employee.sexo, employee.foto,
                DATE_FORMAT(employee.fecha_ingreso, '%Y-%m-%d') AS fecha_ingreso,
                DATE_FORMAT(employee.fecha_cese, '%Y-%m-%d') AS fecha_cese,
                role.nombre AS cargo, site.nombre AS sede,
                COALESCE(agreement.pago_mensual, 0) AS pago_mensual,
                COALESCE(agreement.pago_mensual, 0) AS honorario_mensual_pactado,
                COALESCE(agreement.politica_prorrateo, 'DIAS_CALENDARIO') AS politica_prorrateo,
                DATE_FORMAT(agreement.vigente_desde, '%Y-%m-%d') AS acuerdo_vigente_desde,
                DATE_FORMAT(agreement.vigente_hasta, '%Y-%m-%d') AS acuerdo_vigente_hasta,
                0 AS prorrateo_aplicado, DAY(LAST_DAY(?)) AS dias_periodo,
                DAY(LAST_DAY(?)) AS dias_servicio, ? AS fecha_servicio_desde,
                LAST_DAY(?) AS fecha_servicio_hasta, 1 AS factor_prorrateo,
                0 AS minutos_horas_extra,
                0 AS monto_horas_extra, 0 AS otros_ingresos, 0 AS adelantos, 0 AS cuotas_prestamo,
                0 AS otros_descuentos, COALESCE(agreement.pago_mensual, 0) AS total_servicio,
                COALESCE(agreement.pago_mensual, 0) AS total_depositar,
                IF(agreement.id IS NULL, 'CONFIGURACION_PENDIENTE', 'PREVISUALIZACION') AS estado,
                NULL AS rhe_serie, NULL AS rhe_numero, NULL AS rhe_fecha_emision, NULL AS rhe_importe,
                NULL AS pago_fecha, NULL AS pago_operacion,
                COALESCE(agreement.tarifa_hora_extra, 0) AS tarifa_hora_extra,
                agreement.banco, agreement.tipo_cuenta, agreement.numero_cuenta_ultimos4,
                agreement.cci_ultimos4,
                active_agreement.id AS acuerdo_actual_id,
                active_agreement.pago_mensual AS acuerdo_actual_pago_mensual,
                active_agreement.politica_prorrateo AS acuerdo_actual_politica_prorrateo,
                active_agreement.tarifa_hora_extra AS acuerdo_actual_tarifa_hora_extra,
                active_agreement.banco AS acuerdo_actual_banco,
                active_agreement.tipo_cuenta AS acuerdo_actual_tipo_cuenta,
                active_agreement.numero_cuenta_ultimos4 AS acuerdo_actual_numero_cuenta_ultimos4,
                active_agreement.cci_ultimos4 AS acuerdo_actual_cci_ultimos4,
                DATE_FORMAT(active_agreement.vigente_desde, '%Y-%m-%d') AS acuerdo_actual_vigente_desde,
                DATE_FORMAT(active_agreement.vigente_hasta, '%Y-%m-%d') AS acuerdo_actual_vigente_hasta,
                NULL AS observacion
           FROM personal_empleados employee
           INNER JOIN sedes site ON site.id = employee.sede_id AND site.empresa_id = ?
           INNER JOIN personal_cargos role ON role.id = employee.cargo_id
           LEFT JOIN personal_pago_acuerdos agreement ON agreement.id = (
             SELECT current_agreement.id FROM personal_pago_acuerdos current_agreement
              WHERE current_agreement.empleado_id = employee.id AND current_agreement.vigente_desde <= ?
                AND (current_agreement.vigente_hasta IS NULL OR current_agreement.vigente_hasta >= ?)
              ORDER BY current_agreement.vigente_desde DESC, current_agreement.id DESC LIMIT 1
           )
           LEFT JOIN personal_pago_acuerdos active_agreement ON active_agreement.id = (
             SELECT latest_agreement.id FROM personal_pago_acuerdos latest_agreement
              WHERE latest_agreement.empleado_id = employee.id AND latest_agreement.vigente_hasta IS NULL
              ORDER BY latest_agreement.vigente_desde DESC, latest_agreement.id DESC LIMIT 1
           )
          WHERE employee.fecha_ingreso <= ? AND (employee.fecha_cese IS NULL OR employee.fecha_cese >= ?)
            ${siteFilter}
          ORDER BY site.nombre, employee.apellidos, employee.nombres`,
        [period, period, period, period, companyId, periodEnd(period), period,
          periodEnd(period), period, ...(siteId ? [siteId] : [])],
      );
      rows = result;
    }
    const agreementsByEmployee = new Map<number, RowDataPacket[]>();
    if (!paymentPeriod && rows.length) {
      const employeeIds = rows.map(row => Number(row.empleado_id));
      const placeholders = employeeIds.map(() => '?').join(',');
      const [agreementRows] = await pool.query<RowDataPacket[]>(
        `SELECT agreement.*,
                DATE_FORMAT(agreement.vigente_desde, '%Y-%m-%d') AS vigente_desde_fecha,
                DATE_FORMAT(agreement.vigente_hasta, '%Y-%m-%d') AS vigente_hasta_fecha
           FROM personal_pago_acuerdos agreement
          WHERE agreement.vigente_desde <= ?
            AND (agreement.vigente_hasta IS NULL OR agreement.vigente_hasta >= ?)
            AND agreement.empleado_id IN (${placeholders})
          ORDER BY agreement.empleado_id, agreement.vigente_desde, agreement.id`,
        [periodEnd(period), period, ...employeeIds],
      );
      for (const agreement of agreementRows) {
        const employeeId = Number(agreement.empleado_id);
        const current = agreementsByEmployee.get(employeeId) ?? [];
        current.push(agreement);
        agreementsByEmployee.set(employeeId, current);
      }
    }

    const payments: Array<RowDataPacket & {
      controls: ReturnType<typeof paymentControls>;
      queue: ReturnType<typeof classifyPaymentWorkQueue>;
    }> = rows.map(row => {
      const payment = { ...row } as RowDataPacket & {
        controls: ReturnType<typeof paymentControls>;
        queue: ReturnType<typeof classifyPaymentWorkQueue>;
      };
      if (!paymentPeriod && row.acuerdo_configurado_id) {
        const base = calculateMonthlyAgreementBase({
          periodStart: period,
          employmentStart: String(row.fecha_ingreso),
          employmentEnd: row.fecha_cese ? String(row.fecha_cese) : null,
          agreements: agreementSegments(agreementsByEmployee.get(Number(row.empleado_id)) ?? []),
        });
        payment.pago_mensual = base.appliedMonthlyPayment;
        payment.prorrateo_aplicado = base.prorated ? 1 : 0;
        payment.dias_periodo = base.periodDays;
        payment.dias_servicio = base.serviceDays;
        payment.fecha_servicio_desde = base.serviceStart;
        payment.fecha_servicio_hasta = base.serviceEnd;
        payment.factor_prorrateo = base.factor;
        payment.total_servicio = base.appliedMonthlyPayment;
        payment.total_depositar = base.appliedMonthlyPayment;
      }
      payment.controls = paymentControls(payment, Boolean(paymentPeriod && payment.id));
      payment.queue = classifyPaymentWorkQueue({
        liquidationStatus: payment.estado ? String(payment.estado) : null,
        pendingForReview: payment.controls.pending_for_review,
        readyForBatch: payment.controls.ready_for_batch,
      });
      return payment;
    });
    const summary = payments.reduce((acc, row) => {
      acc.collaborators += 1;
      acc.service_total += Number(row.total_servicio || 0);
      acc.overtime_total += Number(row.monto_horas_extra || 0);
      acc.deductions_total += Number(row.adelantos || 0) + Number(row.cuotas_prestamo || 0) + Number(row.otros_descuentos || 0);
      acc.deposit_total += Number(row.total_depositar || 0);
      if (row.estado === 'PAGADO') acc.paid += 1;
      if (row.estado === 'CONFIGURACION_PENDIENTE') acc.pending_configuration += 1;
      if (!row.rhe_numero) acc.pending_receipts += 1;
      if (row.estado === 'OBSERVADO') acc.observed += 1;
      if (row.estado === 'APROBADO') acc.approved += 1;
      if (row.estado === 'EN_LOTE') acc.in_batch += 1;
      acc.queues[row.queue] += 1;
      return acc;
    }, {
      collaborators: 0, service_total: 0, overtime_total: 0, deductions_total: 0, deposit_total: 0,
      paid: 0, pending_configuration: 0, pending_receipts: 0, observed: 0, approved: 0, in_batch: 0,
      queues: { POR_REVISAR: 0, OBSERVADOS: 0, LISTOS_PARA_PAGO: 0, EN_PAGO: 0, PAGADOS: 0 },
    });
    let batches: RowDataPacket[] = [];
    if (paymentPeriod) {
      const [batchRows] = await pool.query<RowDataPacket[]>(
        `SELECT batch.id, batch.codigo, batch.estado, batch.cantidad_pagos, batch.total_depositar,
                SUM(detail.estado = 'PAGADO') AS pagos_confirmados, batch.created_at, batch.procesado_en
           FROM personal_lotes_pago batch
           LEFT JOIN personal_lote_pago_detalles detail ON detail.lote_pago_id = batch.id
          WHERE batch.empresa_id = ? AND batch.periodo_pago_id = ?
          GROUP BY batch.id ORDER BY batch.id DESC`, [companyId, paymentPeriod.id],
      );
      batches = batchRows;
    }
    return { period: paymentPeriod, month: period.slice(0, 7), summary, payments, batches };
  }

  async history(companyIdValue: number | null, yearValue: unknown, siteIdValue: unknown) {
    const companyId = await this.resolveCompanyId(companyIdValue);
    const currentYear = new Intl.DateTimeFormat('en', {
      timeZone: 'America/Lima', year: 'numeric',
    }).format(new Date());
    const year = String(yearValue ?? currentYear).trim();
    if (!/^20\d{2}$/.test(year) || Number(year) > 2100) {
      throw new ServicePaymentError('El anio del historial no es valido.');
    }
    const siteId = siteIdValue === undefined || siteIdValue === null || siteIdValue === ''
      ? null : positiveId(siteIdValue, 'Sede');
    if (siteId) await this.assertSite(companyId, siteId);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT payment_period.id,
              DATE_FORMAT(payment_period.periodo, '%Y-%m') AS month,
              payment_period.estado,
              payment_period.enviado_revision_en,
              payment_period.aprobado_en,
              payment_period.cerrado_en,
              payment_period.created_at,
              payment_period.updated_at,
              COUNT(liquidation.id) AS collaborators,
              COALESCE(SUM(liquidation.total_servicio), 0) AS service_total,
              COALESCE(SUM(liquidation.monto_horas_extra), 0) AS overtime_total,
              COALESCE(SUM(liquidation.otros_ingresos), 0) AS income_total,
              COALESCE(SUM(liquidation.adelantos + liquidation.cuotas_prestamo + liquidation.otros_descuentos), 0) AS deductions_total,
              COALESCE(SUM(liquidation.total_depositar), 0) AS deposit_total,
              COALESCE(SUM(CASE WHEN liquidation.estado = 'PAGADO' THEN liquidation.total_depositar ELSE 0 END), 0) AS paid_total,
              COALESCE(SUM(liquidation.estado = 'PAGADO'), 0) AS paid_collaborators,
              COALESCE(SUM(liquidation.rhe_numero IS NOT NULL), 0) AS receipts_registered,
              COALESCE(SUM(liquidation.estado IN ('CONFIGURACION_PENDIENTE','OBSERVADO')), 0) AS observed_collaborators
         FROM personal_periodos_pago payment_period
         LEFT JOIN personal_liquidaciones_pago liquidation
           ON liquidation.periodo_pago_id = payment_period.id
          ${siteId ? 'AND liquidation.sede_id = ?' : ''}
        WHERE payment_period.empresa_id = ?
          AND payment_period.periodo BETWEEN ? AND ?
        GROUP BY payment_period.id
        ${siteId ? 'HAVING COUNT(liquidation.id) > 0' : ''}
        ORDER BY payment_period.periodo DESC`,
      siteId
        ? [siteId, companyId, `${year}-01-01`, `${year}-12-01`]
        : [companyId, `${year}-01-01`, `${year}-12-01`],
    );

    const [yearRows] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT YEAR(periodo) AS year
         FROM personal_periodos_pago
        WHERE empresa_id = ?
        ORDER BY year DESC`,
      [companyId],
    );
    const historyRows = rows as Array<RowDataPacket & {
      estado: string;
      deposit_total: number | string;
      paid_total: number | string;
    }>;
    const periods = historyRows.map(row => ({
      ...row,
      collaborators: Number(row.collaborators || 0),
      service_total: Number(row.service_total || 0),
      overtime_total: Number(row.overtime_total || 0),
      income_total: Number(row.income_total || 0),
      deductions_total: Number(row.deductions_total || 0),
      deposit_total: Number(row.deposit_total || 0),
      paid_total: Number(row.paid_total || 0),
      paid_collaborators: Number(row.paid_collaborators || 0),
      receipts_registered: Number(row.receipts_registered || 0),
      observed_collaborators: Number(row.observed_collaborators || 0),
      pending_total: Math.max(0, Number(row.deposit_total || 0) - Number(row.paid_total || 0)),
    }));
    const summary = periods.reduce((result, row) => {
      result.periods += 1;
      if (row.estado === 'CERRADO') result.closed += 1;
      result.deposit_total += Number(row.deposit_total || 0);
      result.paid_total += Number(row.paid_total || 0);
      result.pending_total += Number(row.pending_total || 0);
      return result;
    }, { periods: 0, closed: 0, deposit_total: 0, paid_total: 0, pending_total: 0 });

    const availableYears = yearRows.map(row => Number(row.year)).filter(Number.isInteger);
    if (!availableYears.includes(Number(year))) availableYears.push(Number(year));
    availableYears.sort((left, right) => right - left);
    return { year: Number(year), available_years: availableYears, summary, periods };
  }

  async employeeLedger(companyIdValue: number | null, employeeIdValue: unknown, monthValue: unknown) {
    const companyId = await this.resolveCompanyId(companyIdValue);
    const employeeId = positiveId(employeeIdValue, 'Colaborador');
    const period = normalizePaymentMonth(monthValue);
    const end = periodEnd(period);
    await this.assertEmployee(companyId, employeeId);

    const [employeeRows] = await pool.query<RowDataPacket[]>(
      `SELECT employee.id, employee.codigo_empleado, employee.dni, employee.nombres, employee.apellidos,
              employee.sexo, employee.foto,
              DATE_FORMAT(employee.fecha_ingreso, '%Y-%m-%d') AS fecha_ingreso,
              DATE_FORMAT(employee.fecha_cese, '%Y-%m-%d') AS fecha_cese,
              employee.estado,
              role.nombre AS cargo, site.id AS sede_id, site.nombre AS sede,
              agreement.id AS acuerdo_configurado_id,
              agreement.pago_mensual, agreement.politica_prorrateo,
              DATE_FORMAT(agreement.vigente_desde, '%Y-%m-%d') AS acuerdo_vigente_desde,
              DATE_FORMAT(agreement.vigente_hasta, '%Y-%m-%d') AS acuerdo_vigente_hasta,
              agreement.tarifa_hora_extra, agreement.banco,
              agreement.tipo_cuenta, agreement.numero_cuenta_ultimos4, agreement.cci_ultimos4
         FROM personal_empleados employee
         INNER JOIN sedes site ON site.id = employee.sede_id AND site.empresa_id = ?
         INNER JOIN personal_cargos role ON role.id = employee.cargo_id
         LEFT JOIN personal_pago_acuerdos agreement
           ON agreement.id = (
             SELECT current_agreement.id FROM personal_pago_acuerdos current_agreement
              WHERE current_agreement.empleado_id = employee.id
                AND current_agreement.vigente_desde <= ?
                AND (current_agreement.vigente_hasta IS NULL OR current_agreement.vigente_hasta >= ?)
              ORDER BY current_agreement.vigente_desde DESC, current_agreement.id DESC LIMIT 1
           )
        WHERE employee.id = ? LIMIT 1`,
      [companyId, end, period, employeeId],
    );
    if (!employeeRows.length) throw new ServicePaymentError('Colaborador fuera del alcance autorizado.', 403);
    const employee = employeeRows[0];
    const [employeeAgreements] = await pool.query<RowDataPacket[]>(
      `SELECT agreement.*,
              DATE_FORMAT(agreement.vigente_desde, '%Y-%m-%d') AS vigente_desde_fecha,
              DATE_FORMAT(agreement.vigente_hasta, '%Y-%m-%d') AS vigente_hasta_fecha
         FROM personal_pago_acuerdos agreement
        WHERE agreement.empleado_id = ? AND agreement.vigente_desde <= ?
          AND (agreement.vigente_hasta IS NULL OR agreement.vigente_hasta >= ?)
        ORDER BY agreement.vigente_desde, agreement.id`,
      [employeeId, end, period],
    );
    const paymentPreview = employee.acuerdo_configurado_id ? calculateMonthlyAgreementBase({
      periodStart: period,
      employmentStart: String(employee.fecha_ingreso),
      employmentEnd: employee.fecha_cese ? String(employee.fecha_cese) : null,
      agreements: agreementSegments(employeeAgreements),
    }) : null;

    const [periodRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, estado, periodo, enviado_revision_en, aprobado_en, cerrado_en
         FROM personal_periodos_pago WHERE empresa_id = ? AND periodo = ? LIMIT 1`,
      [companyId, period],
    );
    const paymentPeriod = periodRows[0] ?? null;
    let liquidation: RowDataPacket | null = null;
    let concepts: RowDataPacket[] = [];
    let timeline: RowDataPacket[] = [];
    if (paymentPeriod) {
      const [liquidationRows] = await pool.query<RowDataPacket[]>(
        `SELECT liquidation.*, batch.codigo AS lote_codigo, detail.estado AS lote_detalle_estado,
                detail.numero_operacion AS lote_operacion, detail.pagado_en AS lote_pagado_en
           FROM personal_liquidaciones_pago liquidation
           LEFT JOIN personal_lote_pago_detalles detail ON detail.liquidacion_id = liquidation.id
           LEFT JOIN personal_lotes_pago batch ON batch.id = detail.lote_pago_id
          WHERE liquidation.periodo_pago_id = ? AND liquidation.empleado_id = ? LIMIT 1`,
        [paymentPeriod.id, employeeId],
      );
      liquidation = liquidationRows[0] ?? null;
      if (liquidation) {
        const [conceptRows] = await pool.query<RowDataPacket[]>(
          `SELECT id, tipo, descripcion, monto, cantidad, unidad, created_at
             FROM personal_liquidacion_conceptos WHERE liquidacion_id = ? ORDER BY id`,
          [liquidation.id],
        );
        concepts = conceptRows;
        const [transitionRows] = await pool.query<RowDataPacket[]>(
          `SELECT transition.estado_anterior, transition.estado_nuevo, transition.motivo,
                  transition.created_at, user.nombre AS usuario
             FROM personal_pago_transiciones transition
             LEFT JOIN usuarios user ON user.id = transition.usuario_id
            WHERE transition.empresa_id = ? AND transition.entidad = 'LIQUIDACION'
              AND transition.entidad_id = ? ORDER BY transition.id DESC`,
          [companyId, liquidation.id],
        );
        timeline = transitionRows;
      }
    }

    const [[attendanceResult], [movementResult], [loanResult], [noteResult]] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT DATE_FORMAT(attendance.fecha, '%Y-%m-%d') AS fecha,
                attendance.estado_asistencia, attendance.tipo_asistencia,
                attendance.minutos_tardanza, attendance.minutos_tardanza_retorno,
                COALESCE(overtime.minutos_aprobados, 0) AS minutos_horas_extra,
                justification.estado AS justificacion_estado,
                justification.tipo_incidencia AS justificacion_tipo_incidencia,
                justification.categoria AS justificacion_categoria,
                justification.comentario_revision AS justificacion_comentario_revision,
                justification.revisado_en AS justificacion_revisada_en
           FROM personal_asistencias attendance
           LEFT JOIN (
             SELECT asistencia_id, SUM(minutos_aprobados) AS minutos_aprobados
               FROM personal_sobretiempo_solicitudes WHERE estado = 'APROBADO' GROUP BY asistencia_id
           ) overtime ON overtime.asistencia_id = attendance.id
           LEFT JOIN personal_justificaciones_asistencia justification
             ON justification.id = (
               SELECT candidate.id
                 FROM personal_justificaciones_asistencia candidate
                WHERE candidate.asistencia_id = attendance.id
                ORDER BY candidate.id DESC
                LIMIT 1
             )
          WHERE attendance.empleado_id = ? AND attendance.fecha BETWEEN ? AND ?
          ORDER BY attendance.fecha`,
        [employeeId, period, end],
      ),
      pool.query<RowDataPacket[]>(
        `SELECT id, tipo, concepto, monto, estado, created_at, aplicado_en
           FROM personal_pago_movimientos WHERE empleado_id = ? AND periodo = ? ORDER BY id DESC`,
        [employeeId, period],
      ),
      pool.query<RowDataPacket[]>(
        `SELECT id, concepto, monto_original, saldo_pendiente, cuota_mensual, periodo_inicio, estado, created_at
           FROM personal_prestamos WHERE empleado_id = ? AND periodo_inicio <= ?
          ORDER BY FIELD(estado, 'ACTIVO','PAGADO','CANCELADO'), id DESC`,
        [employeeId, period],
      ),
      pool.query<RowDataPacket[]>(
        `SELECT note.id, note.nota, note.monto_referencial, note.estado, note.motivo_anulacion,
                note.created_at, note.anulado_en, creator.nombre AS creado_por_nombre,
                canceller.nombre AS anulado_por_nombre
           FROM personal_pago_notas note
           INNER JOIN usuarios creator ON creator.id = note.creado_por
           LEFT JOIN usuarios canceller ON canceller.id = note.anulado_por
          WHERE note.empresa_id = ? AND note.empleado_id = ? AND note.periodo = ?
          ORDER BY note.id DESC`,
        [companyId, employeeId, period],
      ),
    ]);
    const attendance = attendanceResult as RowDataPacket[];
    const attendanceSummary = attendance.reduce((summary, row) => {
      const status = String(row.estado_asistencia);
      summary.records += 1;
      if (['PRESENTE', 'TARDANZA'].includes(status)) summary.attended += 1;
      if (status === 'TARDANZA') summary.late += 1;
      if (status === 'FALTA') summary.absent += 1;
      const justificationStatus = String(row.justificacion_estado || '');
      const incident = ['TARDANZA', 'FALTA'].includes(status);
      if (['PERMISO', 'VACACIONES', 'NO_LABORABLE'].includes(status)
        || (incident && justificationStatus === 'APROBADA')) summary.justified += 1;
      if (incident && justificationStatus === 'PENDIENTE') summary.pending_justifications += 1;
      if (status === 'TARDANZA' && justificationStatus === 'APROBADA') summary.justified_late += 1;
      if (status === 'FALTA' && justificationStatus === 'APROBADA') summary.justified_absence += 1;
      if (status === 'TARDANZA' && justificationStatus !== 'APROBADA') summary.unjustified_late += 1;
      if (status === 'FALTA' && justificationStatus !== 'APROBADA') summary.unjustified_absence += 1;
      summary.delay_minutes += Number(row.minutos_tardanza || 0) + Number(row.minutos_tardanza_retorno || 0);
      summary.overtime_minutes += Number(row.minutos_horas_extra || 0);
      return summary;
    }, {
      records: 0, attended: 0, late: 0, absent: 0, justified: 0,
      pending_justifications: 0, justified_late: 0, justified_absence: 0,
      unjustified_late: 0, unjustified_absence: 0,
      delay_minutes: 0, overtime_minutes: 0,
    });

    const controls = paymentControls({
      ...employeeRows[0],
      ...(liquidation ?? {}),
      acuerdo_configurado_id: liquidation?.acuerdo_id ?? employeeRows[0].acuerdo_configurado_id,
      tarifa_hora_extra: employeeRows[0].tarifa_hora_extra,
      banco: employeeRows[0].banco,
      numero_cuenta_ultimos4: employeeRows[0].numero_cuenta_ultimos4,
    } as RowDataPacket, Boolean(liquidation));

    return {
      month: period.slice(0, 7), employee, period: paymentPeriod,
      liquidation, payment_preview: paymentPreview, concepts, attendance, attendance_summary: attendanceSummary,
      movements: movementResult, loans: loanResult, notes: noteResult, timeline, controls,
    };
  }

  async addEmployeeNote(companyIdValue: number | null, employeeIdValue: unknown, actorId: number, input: Record<string, unknown>) {
    const companyId = await this.resolveCompanyId(companyIdValue);
    const employeeId = positiveId(employeeIdValue, 'Colaborador');
    const period = normalizePaymentMonth(input.month);
    const note = text(input.note, 'Nota', 800);
    const referenceAmount = input.reference_amount === undefined || input.reference_amount === null || input.reference_amount === ''
      ? null : amount(input.reference_amount, 'Monto referencial');
    await this.assertEmployee(companyId, employeeId);
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO personal_pago_notas
         (empresa_id, empleado_id, periodo, nota, monto_referencial, creado_por)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [companyId, employeeId, period, note, referenceAmount, actorId],
    );
    await this.audit(pool, 'PAGO_NOTA_CREADA', employeeId, actorId, { note_id: result.insertId, period, reference_amount: referenceAmount });
    return { id: result.insertId };
  }

  async cancelEmployeeNote(companyIdValue: number | null, noteIdValue: unknown, actorId: number, input: Record<string, unknown>) {
    const companyId = await this.resolveCompanyId(companyIdValue);
    const noteId = positiveId(noteIdValue, 'Nota');
    const reason = text(input.reason, 'Motivo de anulacion', 300);
    const result = await runInTransaction(async connection => {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT note.id, note.empleado_id, note.estado
           FROM personal_pago_notas note WHERE note.id = ? AND note.empresa_id = ? LIMIT 1 FOR UPDATE`,
        [noteId, companyId],
      );
      if (!rows.length) throw new ServicePaymentError('Nota no encontrada.', 404);
      if (rows[0].estado !== 'ACTIVA') throw new ServicePaymentError('La nota ya fue anulada.', 409);
      await connection.query(
        `UPDATE personal_pago_notas SET estado = 'ANULADA', anulado_por = ?, motivo_anulacion = ?, anulado_en = NOW()
          WHERE id = ?`, [actorId, reason, noteId],
      );
      await this.audit(connection, 'PAGO_NOTA_ANULADA', Number(rows[0].empleado_id), actorId, { note_id: noteId, reason });
      return { id: noteId, status: 'ANULADA' };
    });
  }

  async saveAgreement(companyIdValue: number | null, employeeIdValue: unknown, actorId: number, input: Record<string, unknown>) {
    const companyId = await this.resolveCompanyId(companyIdValue);
    const employeeId = positiveId(employeeIdValue, 'Colaborador');
    const monthlyPayment = amount(input.monthly_payment, 'Pago mensual', false);
    const overtimeRate = amount(input.overtime_hourly_rate, 'Tarifa de hora extra');
    const partialPeriodPolicy = prorationPolicy(input.proration_policy);
    const effectiveFrom = String(input.effective_from ?? '').trim();
    const requestedAgreementId = input.agreement_id === undefined || input.agreement_id === null || input.agreement_id === ''
      ? null : positiveId(input.agreement_id, 'Acuerdo económico');
    const bank = String(input.bank ?? '').trim().slice(0, 100) || null;
    const accountType = input.account_type ? String(input.account_type).toUpperCase() : null;
    if (accountType && !['AHORROS', 'CORRIENTE'].includes(accountType)) throw new ServicePaymentError('Tipo de cuenta no valido.');
    const account = optionalDigits(input.account_number, 6, 30);
    const cci = optionalDigits(input.cci, 20, 20);
    if ((account || cci) && !bank) throw new ServicePaymentError('Indica el banco de la cuenta de deposito.');
    await this.assertEmployee(companyId, employeeId);

    const result = await runInTransaction(async connection => {
      const [current] = await connection.query<RowDataPacket[]>(
        `SELECT agreement.*,
                DATE_FORMAT(agreement.vigente_desde, '%Y-%m-%d') AS vigente_desde_fecha
           FROM personal_pago_acuerdos agreement
          WHERE agreement.empleado_id = ? AND agreement.vigente_hasta IS NULL
          ORDER BY agreement.vigente_desde DESC, agreement.id DESC
          LIMIT 1 FOR UPDATE`, [employeeId],
      );
      let agreementId: number;
      const currentStart = current.length ? String(current[0].vigente_desde_fecha) : null;
      const currentId = current.length ? Number(current[0].id) : null;
      if (requestedAgreementId && requestedAgreementId !== currentId) {
        throw new ServicePaymentError('El acuerdo económico cambió mientras editabas. Actualiza la pantalla y vuelve a intentarlo.', 409);
      }
      let writeMode: ReturnType<typeof planPaymentAgreementWrite>;
      try {
        writeMode = planPaymentAgreementWrite({ currentStart, requestedStart: effectiveFrom, today: businessDate() });
      } catch (error) {
        throw new ServicePaymentError(error instanceof Error ? error.message : 'Fecha de vigencia no válida.', 409);
      }

      if (writeMode !== 'UPDATE_CURRENT') {
        const [protectedPeriod] = await connection.query<RowDataPacket[]>(
          `SELECT payment_period.periodo, payment_period.estado
             FROM personal_periodos_pago payment_period
            WHERE payment_period.empresa_id = ?
              AND payment_period.periodo = STR_TO_DATE(CONCAT(LEFT(?, 7), '-01'), '%Y-%m-%d')
              AND payment_period.estado <> 'BORRADOR'
            LIMIT 1`,
          [companyId, effectiveFrom],
        );
        if (protectedPeriod.length) {
          throw new ServicePaymentError(
            `El periodo ${String(protectedPeriod[0].periodo).slice(0, 7)} ya está protegido. Elige una fecha de un periodo abierto.`,
            409,
          );
        }
      }

      if (writeMode === 'UPDATE_CURRENT' || writeMode === 'RESCHEDULE_FUTURE') {
        agreementId = currentId!;
        if (writeMode === 'RESCHEDULE_FUTURE') {
          const [lockedUsage] = await connection.query<RowDataPacket[]>(
            `SELECT payment_period.periodo, payment_period.estado
               FROM personal_liquidaciones_pago liquidation
               INNER JOIN personal_periodos_pago payment_period ON payment_period.id = liquidation.periodo_pago_id
              WHERE liquidation.acuerdo_id = ? AND payment_period.estado <> 'BORRADOR'
              LIMIT 1`, [agreementId],
          );
          if (lockedUsage.length) {
            throw new ServicePaymentError('La programación futura ya forma parte de un periodo protegido y no puede reprogramarse.', 409);
          }
          const [previous] = await connection.query<RowDataPacket[]>(
            `SELECT agreement.id,
                    DATE_FORMAT(agreement.vigente_desde, '%Y-%m-%d') AS vigente_desde_fecha,
                    DATE_FORMAT(agreement.vigente_hasta, '%Y-%m-%d') AS vigente_hasta_fecha
               FROM personal_pago_acuerdos agreement
              WHERE agreement.empleado_id = ? AND agreement.id <> ? AND agreement.vigente_desde < ?
              ORDER BY agreement.vigente_desde DESC, agreement.id DESC
              LIMIT 1 FOR UPDATE`, [employeeId, agreementId, currentStart],
          );
          if (previous.length) {
            const previousStart = String(previous[0].vigente_desde_fecha);
            if (previousStart >= effectiveFrom) {
              throw new ServicePaymentError('La fecha elegida se cruza con un acuerdo histórico. Selecciona una fecha posterior.', 409);
            }
            const previousEnd = previous[0].vigente_hasta_fecha ? String(previous[0].vigente_hasta_fecha) : null;
            if (previousEnd && previousEnd >= effectiveFrom) {
              await connection.query(
                `UPDATE personal_pago_acuerdos SET vigente_hasta = DATE_SUB(?, INTERVAL 1 DAY) WHERE id = ?`,
                [effectiveFrom, previous[0].id],
              );
            }
          }
        }
        await connection.query(
          `UPDATE personal_pago_acuerdos SET pago_mensual = ?, politica_prorrateo = ?, tarifa_hora_extra = ?, banco = ?, tipo_cuenta = ?,
             numero_cuenta = COALESCE(?, numero_cuenta), numero_cuenta_ultimos4 = COALESCE(?, numero_cuenta_ultimos4),
             cci = COALESCE(?, cci), cci_ultimos4 = COALESCE(?, cci_ultimos4), vigente_desde = ?, creado_por = ? WHERE id = ?`,
          [monthlyPayment, partialPeriodPolicy, overtimeRate, bank, accountType, encryptSensitive(account), account?.slice(-4) ?? null,
            encryptSensitive(cci), cci?.slice(-4) ?? null, effectiveFrom, actorId, agreementId],
        );
      } else {
        if (writeMode === 'CREATE_VERSION' && current.length) {
          await connection.query(`UPDATE personal_pago_acuerdos SET vigente_hasta = DATE_SUB(?, INTERVAL 1 DAY) WHERE id = ?`, [effectiveFrom, current[0].id]);
        }
        const [result] = await connection.query<ResultSetHeader>(
          `INSERT INTO personal_pago_acuerdos
             (empleado_id, pago_mensual, politica_prorrateo, tarifa_hora_extra, banco, tipo_cuenta, numero_cuenta,
              numero_cuenta_ultimos4, cci, cci_ultimos4, vigente_desde, creado_por)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [employeeId, monthlyPayment, partialPeriodPolicy, overtimeRate, bank, accountType, encryptSensitive(account), account?.slice(-4) ?? null,
            encryptSensitive(cci), cci?.slice(-4) ?? null, effectiveFrom, actorId],
        );
        agreementId = result.insertId;
      }
      await this.audit(connection, 'PAGO_ACUERDO_ACTUALIZADO', employeeId, actorId, {
        agreement_id: agreementId, monthly_payment: monthlyPayment, proration_policy: partialPeriodPolicy,
        overtime_hourly_rate: overtimeRate, effective_from: effectiveFrom, write_mode: writeMode,
      });
      return { id: agreementId, employee_id: employeeId };
    });
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(input.month ?? ''))) {
      await this.refreshDraftEmployee(companyId, employeeId, input.month, actorId, 'ACUERDO_ACTUALIZADO');
    }
    return result;
  }

  async createMovement(companyIdValue: number | null, actorId: number, input: Record<string, unknown>) {
    const companyId = await this.resolveCompanyId(companyIdValue);
    const employeeId = positiveId(input.employee_id, 'Colaborador');
    await this.assertEmployee(companyId, employeeId);
    const period = normalizePaymentMonth(input.month);
    const [lockedPeriods] = await pool.query<RowDataPacket[]>(
      `SELECT estado FROM personal_periodos_pago WHERE empresa_id = ? AND periodo = ? AND estado <> 'BORRADOR' LIMIT 1`, [companyId, period],
    );
    if (lockedPeriods.length) throw new ServicePaymentError('El periodo ya fue enviado a revision y no admite nuevos movimientos.', 409);
    const type = String(input.type ?? '').toUpperCase();
    if (!['ADELANTO', 'OTRO_INGRESO', 'OTRO_DESCUENTO'].includes(type)) throw new ServicePaymentError('Tipo de movimiento no valido.');
    const concept = text(input.concept, 'Concepto');
    const value = amount(input.amount, 'Monto', false);
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO personal_pago_movimientos (empleado_id, periodo, tipo, concepto, monto, creado_por)
       VALUES (?, ?, ?, ?, ?, ?)`, [employeeId, period, type, concept, value, actorId],
    );
    await this.refreshDraftEmployee(companyId, employeeId, input.month, actorId, 'MOVIMIENTO_REGISTRADO');
    return { id: result.insertId };
  }

  async createLoan(companyIdValue: number | null, actorId: number, input: Record<string, unknown>) {
    const companyId = await this.resolveCompanyId(companyIdValue);
    const employeeId = positiveId(input.employee_id, 'Colaborador');
    await this.assertEmployee(companyId, employeeId);
    const total = amount(input.total_amount, 'Monto del prestamo', false);
    const installment = amount(input.monthly_installment, 'Cuota mensual', false);
    if (installment > total) throw new ServicePaymentError('La cuota no puede superar el monto del prestamo.');
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO personal_prestamos
         (empleado_id, concepto, monto_original, saldo_pendiente, cuota_mensual, periodo_inicio, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [employeeId, text(input.concept, 'Concepto'), total, total, installment, normalizePaymentMonth(input.start_month), actorId],
    );
    await this.refreshDraftEmployee(companyId, employeeId, input.start_month, actorId, 'PRESTAMO_REGISTRADO');
    return { id: result.insertId };
  }

  async generate(companyIdValue: number | null, actorId: number, monthValue: unknown) {
    const companyId = await this.resolveCompanyId(companyIdValue);
    const period = normalizePaymentMonth(monthValue);
    const end = periodEnd(period);
    return runInTransaction(async connection => {
      await connection.query(
        `INSERT INTO personal_periodos_pago (empresa_id, periodo, generado_por)
         VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), generado_por = VALUES(generado_por)`,
        [companyId, period, actorId],
      );
      const [periodRows] = await connection.query<RowDataPacket[]>(
        `SELECT id, estado FROM personal_periodos_pago WHERE empresa_id = ? AND periodo = ? LIMIT 1 FOR UPDATE`, [companyId, period],
      );
      const periodId = Number(periodRows[0].id);
      if (periodRows[0].estado !== 'BORRADOR') throw new ServicePaymentError('Solo un periodo en borrador puede recalcularse.', 409);
      const [paid] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM personal_liquidaciones_pago WHERE periodo_pago_id = ? AND estado = 'PAGADO' LIMIT 1`, [periodId],
      );
      if (paid.length) throw new ServicePaymentError('El periodo contiene pagos realizados y no puede recalcularse.', 409);
      const [receipts] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM personal_liquidaciones_pago
          WHERE periodo_pago_id = ? AND rhe_numero IS NOT NULL LIMIT 1`, [periodId],
      );
      if (receipts.length) {
        throw new ServicePaymentError('El periodo ya contiene Recibos por Honorarios y no puede recalcularse.', 409);
      }
      await connection.query(`DELETE FROM personal_liquidaciones_pago WHERE periodo_pago_id = ?`, [periodId]);
      const [employees] = await connection.query<RowDataPacket[]>(
        `SELECT employee.id, employee.sede_id,
                DATE_FORMAT(employee.fecha_ingreso, '%Y-%m-%d') AS fecha_ingreso,
                DATE_FORMAT(employee.fecha_cese, '%Y-%m-%d') AS fecha_cese
           FROM personal_empleados employee
           INNER JOIN sedes site ON site.id = employee.sede_id
          WHERE site.empresa_id = ?
            AND employee.fecha_ingreso <= ? AND (employee.fecha_cese IS NULL OR employee.fecha_cese >= ?)
          ORDER BY employee.id`, [companyId, end, period],
      );
      for (const employee of employees) {
        await this.generateEmployee(
          connection, periodId, Number(employee.id), Number(employee.sede_id), period, end,
          String(employee.fecha_ingreso), employee.fecha_cese ? String(employee.fecha_cese) : null,
        );
      }
      await this.audit(connection, 'PERIODO_PAGO_GENERADO', null, actorId, { period_id: periodId, period, collaborators: employees.length });
      return { id: periodId, month: period.slice(0, 7), collaborators: employees.length };
    });
  }

  async registerReceipt(companyIdValue: number | null, liquidationIdValue: unknown, actorId: number, input: Record<string, unknown>) {
    const companyId = await this.resolveCompanyId(companyIdValue);
    const liquidationId = positiveId(liquidationIdValue, 'Liquidacion');
    const serie = text(input.series, 'Serie', 8).toUpperCase();
    const number = text(input.number, 'Numero de recibo', 20);
    const issuedAt = String(input.issued_at ?? '').trim();
    const receiptAmount = amount(input.amount, 'Importe del recibo', false);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedAt)) throw new ServicePaymentError('Fecha de emision no valida.');
    return runInTransaction(async connection => {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT liquidation.id, liquidation.empleado_id, liquidation.estado, liquidation.total_servicio,
                payment_period.estado AS periodo_estado
           FROM personal_liquidaciones_pago liquidation
           INNER JOIN personal_periodos_pago payment_period ON payment_period.id = liquidation.periodo_pago_id
          WHERE liquidation.id = ? AND payment_period.empresa_id = ? LIMIT 1 FOR UPDATE`,
        [liquidationId, companyId],
      );
      if (!rows.length) throw new ServicePaymentError('Liquidacion no encontrada.', 404);
      const liquidation = rows[0];
      if (!['EN_REVISION', 'APROBADO'].includes(String(liquidation.periodo_estado))
        || ['PAGADO', 'EN_LOTE'].includes(String(liquidation.estado))) {
        throw new ServicePaymentError('El RHE solo puede registrarse durante la revision o despues de aprobar el periodo.', 409);
      }
      if (Math.abs(receiptAmount - Number(liquidation.total_servicio)) > 0.01) {
        throw new ServicePaymentError('El importe del RHE debe coincidir con el total bruto aprobado.', 409);
      }
      await connection.query(
        `UPDATE personal_liquidaciones_pago
            SET rhe_serie = ?, rhe_numero = ?, rhe_fecha_emision = ?, rhe_importe = ?
          WHERE id = ?`,
        [serie, number, issuedAt, receiptAmount, liquidationId],
      );
      await this.audit(connection, 'RHE_REGISTRADO', Number(liquidation.empleado_id), actorId, {
        liquidation_id: liquidationId, series: serie, number, amount: receiptAmount,
      });
      return { id: liquidationId };
    });
  }

  async transitionPeriod(companyIdValue: number | null, periodIdValue: unknown, actorId: number, input: Record<string, unknown>) {
    const companyId = await this.resolveCompanyId(companyIdValue);
    const periodId = positiveId(periodIdValue, 'Periodo');
    const action = String(input.action ?? '').toUpperCase();
    const reason = String(input.reason ?? '').trim().slice(0, 500) || null;
    const rules: Record<string, { from: string[]; to: string }> = {
      ENVIAR_REVISION: { from: ['BORRADOR'], to: 'EN_REVISION' },
      DEVOLVER_BORRADOR: { from: ['EN_REVISION'], to: 'BORRADOR' },
      APROBAR: { from: ['EN_REVISION'], to: 'APROBADO' },
      CERRAR: { from: ['PAGADO'], to: 'CERRADO' },
    };
    const rule = rules[action];
    if (!rule) throw new ServicePaymentError('Transicion de periodo no valida.');
    return runInTransaction(async connection => {
      const [periods] = await connection.query<RowDataPacket[]>(
        `SELECT * FROM personal_periodos_pago WHERE id = ? AND empresa_id = ? LIMIT 1 FOR UPDATE`, [periodId, companyId],
      );
      if (!periods.length) throw new ServicePaymentError('Periodo de pago no encontrado.', 404);
      const current = String(periods[0].estado);
      if (!rule.from.includes(current)) throw new ServicePaymentError(`El periodo ${current.toLowerCase().replace(/_/g, ' ')} no admite esta accion.`, 409);
      if (action === 'ENVIAR_REVISION' || action === 'APROBAR') {
        const [[blocking]] = await connection.query<RowDataPacket[]>(
          `SELECT SUM(liquidation.estado = 'CONFIGURACION_PENDIENTE') AS configuration_pending,
                  SUM(liquidation.estado = 'OBSERVADO') AS observed,
                  SUM(agreement.banco IS NULL OR agreement.numero_cuenta_ultimos4 IS NULL) AS bank_pending,
                  SUM(liquidation.minutos_horas_extra > 0 AND COALESCE(agreement.tarifa_hora_extra, 0) <= 0) AS overtime_rate_pending,
                  COUNT(*) AS total
             FROM personal_liquidaciones_pago liquidation
             LEFT JOIN personal_pago_acuerdos agreement ON agreement.id = liquidation.acuerdo_id
            WHERE liquidation.periodo_pago_id = ?`, [periodId],
        );
        if (!Number(blocking.total)) throw new ServicePaymentError('El periodo no contiene liquidaciones.', 409);
        if (Number(blocking.configuration_pending)) throw new ServicePaymentError('Completa la configuracion de pago de todos los colaboradores.', 409);
        if (Number(blocking.observed)) throw new ServicePaymentError('Resuelve las liquidaciones observadas antes de continuar.', 409);
        if (Number(blocking.bank_pending)) throw new ServicePaymentError('Completa la cuenta bancaria de todos los colaboradores antes de continuar.', 409);
        if (Number(blocking.overtime_rate_pending)) throw new ServicePaymentError('Configura la tarifa de horas extra de los colaboradores que tienen sobretiempo aprobado.', 409);
      }
      if (action === 'ENVIAR_REVISION') {
        await connection.query(`UPDATE personal_liquidaciones_pago SET estado = 'EN_REVISION' WHERE periodo_pago_id = ? AND estado IN ('BORRADOR','LISTO_PARA_PAGO')`, [periodId]);
        await connection.query(`UPDATE personal_periodos_pago SET estado = 'EN_REVISION', enviado_revision_por = ?, enviado_revision_en = NOW(), observacion = ? WHERE id = ?`, [actorId, reason, periodId]);
      } else if (action === 'DEVOLVER_BORRADOR') {
        if (!reason) throw new ServicePaymentError('Indica el motivo para devolver el periodo a borrador.');
        await connection.query(`UPDATE personal_liquidaciones_pago SET estado = IF(rhe_numero IS NULL, 'BORRADOR', 'LISTO_PARA_PAGO'), aprobado_por = NULL, aprobado_en = NULL WHERE periodo_pago_id = ? AND estado = 'EN_REVISION'`, [periodId]);
        await connection.query(`UPDATE personal_periodos_pago SET estado = 'BORRADOR', aprobado_por = NULL, aprobado_en = NULL, observacion = ? WHERE id = ?`, [reason, periodId]);
      } else if (action === 'APROBAR') {
        await connection.query(`UPDATE personal_liquidaciones_pago SET estado = 'APROBADO', aprobado_por = ?, aprobado_en = NOW() WHERE periodo_pago_id = ? AND estado = 'EN_REVISION'`, [actorId, periodId]);
        await connection.query(`UPDATE personal_periodos_pago SET estado = 'APROBADO', aprobado_por = ?, aprobado_en = NOW(), observacion = ? WHERE id = ?`, [actorId, reason, periodId]);
      } else {
        await connection.query(`UPDATE personal_periodos_pago SET estado = 'CERRADO', cerrado_por = ?, cerrado_en = NOW(), observacion = ? WHERE id = ?`, [actorId, reason, periodId]);
      }
      await this.transition(connection, companyId, 'PERIODO', periodId, current, rule.to, actorId, reason);
      await this.audit(connection, `PERIODO_PAGO_${rule.to}`, null, actorId, { period_id: periodId, previous_status: current, reason });
      return { id: periodId, status: rule.to };
    });
  }

  async createBatch(companyIdValue: number | null, periodIdValue: unknown, actorId: number) {
    const companyId = await this.resolveCompanyId(companyIdValue);
    const periodId = positiveId(periodIdValue, 'Periodo');
    return runInTransaction(async connection => {
      const [periods] = await connection.query<RowDataPacket[]>(
        `SELECT * FROM personal_periodos_pago WHERE id = ? AND empresa_id = ? LIMIT 1 FOR UPDATE`, [periodId, companyId],
      );
      if (!periods.length) throw new ServicePaymentError('Periodo de pago no encontrado.', 404);
      if (periods[0].estado !== 'APROBADO') throw new ServicePaymentError('Primero aprueba el periodo mensual.', 409);
      const [payments] = await connection.query<RowDataPacket[]>(
        `SELECT liquidation.id, liquidation.total_servicio, liquidation.total_depositar,
                liquidation.rhe_serie, liquidation.rhe_numero, liquidation.rhe_importe,
                agreement.banco, agreement.numero_cuenta_ultimos4
           FROM personal_liquidaciones_pago liquidation
           LEFT JOIN personal_pago_acuerdos agreement ON agreement.id = liquidation.acuerdo_id
          WHERE liquidation.periodo_pago_id = ? AND liquidation.estado = 'APROBADO'
          ORDER BY liquidation.id FOR UPDATE`, [periodId],
      );
      if (!payments.length) throw new ServicePaymentError('No hay pagos aprobados disponibles para el lote.', 409);
      const invalidReceipt = payments.find(row => !row.rhe_serie || !row.rhe_numero || row.rhe_importe === null || Math.abs(Number(row.rhe_importe) - Number(row.total_servicio)) > 0.01);
      if (invalidReceipt) throw new ServicePaymentError('Todos los RHE deben estar registrados y coincidir con el importe bruto aprobado.', 409);
      if (payments.some(row => !row.banco || !row.numero_cuenta_ultimos4)) throw new ServicePaymentError('Todos los colaboradores deben tener una cuenta bancaria configurada.', 409);
      const total = Math.round(payments.reduce((sum, row) => sum + Number(row.total_depositar), 0) * 100) / 100;
      const code = `PAG-${String(periods[0].periodo).slice(0, 7).replace('-', '')}-${String(periodId).padStart(5, '0')}`;
      const [insert] = await connection.query<ResultSetHeader>(
        `INSERT INTO personal_lotes_pago (empresa_id, periodo_pago_id, codigo, estado, cantidad_pagos, total_depositar, creado_por)
         VALUES (?, ?, ?, 'EN_PROCESO', ?, ?, ?)`, [companyId, periodId, code, payments.length, total, actorId],
      );
      for (const payment of payments) {
        await connection.query(`INSERT INTO personal_lote_pago_detalles (lote_pago_id, liquidacion_id, monto) VALUES (?, ?, ?)`, [insert.insertId, payment.id, payment.total_depositar]);
      }
      await connection.query(`UPDATE personal_liquidaciones_pago SET estado = 'EN_LOTE' WHERE periodo_pago_id = ? AND estado = 'APROBADO'`, [periodId]);
      await connection.query(`UPDATE personal_periodos_pago SET estado = 'EN_PAGO' WHERE id = ?`, [periodId]);
      await this.transition(connection, companyId, 'LOTE', insert.insertId, null, 'EN_PROCESO', actorId, null);
      await this.transition(connection, companyId, 'PERIODO', periodId, 'APROBADO', 'EN_PAGO', actorId, null);
      await this.audit(connection, 'LOTE_PAGO_CREADO', null, actorId, { batch_id: insert.insertId, period_id: periodId, code, payments: payments.length, total });
      return { id: insert.insertId, code, payments: payments.length, total };
    });
  }

  async markPaid(companyIdValue: number | null, liquidationIdValue: unknown, actorId: number, input: Record<string, unknown>) {
    const companyId = await this.resolveCompanyId(companyIdValue);
    const liquidationId = positiveId(liquidationIdValue, 'Liquidacion');
    const operation = text(input.operation_number, 'Numero de operacion', 80);
    return runInTransaction(async connection => {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT liquidation.*, agreement.banco, agreement.numero_cuenta_ultimos4, payment_period.id AS period_id
           FROM personal_liquidaciones_pago liquidation
           INNER JOIN personal_periodos_pago payment_period ON payment_period.id = liquidation.periodo_pago_id
           LEFT JOIN personal_pago_acuerdos agreement ON agreement.id = liquidation.acuerdo_id
          WHERE liquidation.id = ? AND payment_period.empresa_id = ? LIMIT 1 FOR UPDATE`, [liquidationId, companyId],
      );
      if (!rows.length) throw new ServicePaymentError('Liquidacion no encontrada.', 404);
      const row = rows[0];
      if (row.estado === 'PAGADO') throw new ServicePaymentError('Este pago ya fue registrado.', 409);
      if (row.estado !== 'EN_LOTE') throw new ServicePaymentError('El pago debe pertenecer a un lote bancario activo.', 409);
      if (!row.rhe_numero || !row.rhe_serie) throw new ServicePaymentError('Registra primero el Recibo por Honorarios.', 409);
      if (!row.banco || !row.numero_cuenta_ultimos4) throw new ServicePaymentError('Configura primero la cuenta bancaria del colaborador.', 409);
      await connection.query(
        `UPDATE personal_liquidaciones_pago SET estado = 'PAGADO', pago_fecha = NOW(), pago_operacion = ?,
           pago_banco = ?, pago_cuenta_ultimos4 = ?, pagado_por = ? WHERE id = ?`,
        [operation, row.banco, row.numero_cuenta_ultimos4, actorId, liquidationId],
      );
      await connection.query(
        `UPDATE personal_lote_pago_detalles SET estado = 'PAGADO', numero_operacion = ?, pagado_en = NOW()
          WHERE liquidacion_id = ? AND estado = 'PENDIENTE'`, [operation, liquidationId],
      );
      const [concepts] = await connection.query<RowDataPacket[]>(
        `SELECT tipo, origen_id FROM personal_liquidacion_conceptos WHERE liquidacion_id = ? AND origen_id IS NOT NULL`, [liquidationId],
      );
      for (const concept of concepts) {
        if (concept.tipo === 'CUOTA_PRESTAMO') {
          await connection.query(
            `UPDATE personal_prestamos loan
             INNER JOIN personal_liquidacion_conceptos concept ON concept.origen_id = loan.id AND concept.liquidacion_id = ?
                SET loan.estado = IF(loan.saldo_pendiente - concept.monto <= 0, 'PAGADO', 'ACTIVO'),
                    loan.saldo_pendiente = GREATEST(0, loan.saldo_pendiente - concept.monto)
              WHERE loan.id = ?`, [liquidationId, concept.origen_id],
          );
        } else if (['ADELANTO', 'OTRO_INGRESO', 'OTRO_DESCUENTO'].includes(String(concept.tipo))) {
          await connection.query(`UPDATE personal_pago_movimientos SET estado = 'APLICADO', aplicado_en = NOW() WHERE id = ?`, [concept.origen_id]);
        }
      }
      const [[remaining]] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM personal_liquidaciones_pago WHERE periodo_pago_id = ? AND estado <> 'PAGADO'`, [row.period_id],
      );
      if (Number(remaining.total) === 0) {
        await connection.query(`UPDATE personal_periodos_pago SET estado = 'PAGADO' WHERE id = ?`, [row.period_id]);
        await connection.query(
          `UPDATE personal_lotes_pago SET estado = 'PAGADO', procesado_por = ?, procesado_en = NOW()
            WHERE periodo_pago_id = ? AND estado = 'EN_PROCESO'`, [actorId, row.period_id],
        );
        await this.transition(connection, companyId, 'PERIODO', Number(row.period_id), 'EN_PAGO', 'PAGADO', actorId, null);
      }
      await this.audit(connection, 'PAGO_DEPOSITADO', Number(row.empleado_id), actorId, { liquidation_id: liquidationId, operation, amount: Number(row.total_depositar) });
      return { id: liquidationId, status: 'PAGADO' };
    });
  }

  private async generateEmployee(
    connection: PoolConnection,
    periodId: number,
    employeeId: number,
    siteId: number,
    period: string,
    end: string,
    employmentStart: string,
    employmentEnd: string | null,
  ) {
    const [agreements] = await connection.query<RowDataPacket[]>(
      `SELECT agreement.*,
              DATE_FORMAT(agreement.vigente_desde, '%Y-%m-%d') AS vigente_desde_fecha,
              DATE_FORMAT(agreement.vigente_hasta, '%Y-%m-%d') AS vigente_hasta_fecha
         FROM personal_pago_acuerdos agreement WHERE agreement.empleado_id = ? AND agreement.vigente_desde <= ?
       AND (agreement.vigente_hasta IS NULL OR agreement.vigente_hasta >= ?)
       ORDER BY agreement.vigente_desde, agreement.id`, [employeeId, end, period],
    );
    const agreement = agreements.at(-1) ?? null;
    const monthlyBase = calculateMonthlyAgreementBase({
      periodStart: period,
      employmentStart,
      employmentEnd,
      agreements: agreementSegments(agreements),
    });
    const [[overtime]] = await connection.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(request.minutos_aprobados), 0) AS minutes
         FROM personal_sobretiempo_solicitudes request
         INNER JOIN personal_asistencias attendance ON attendance.id = request.asistencia_id
        WHERE request.empleado_id = ? AND request.estado = 'APROBADO'
          AND attendance.fecha BETWEEN ? AND ?`, [employeeId, period, end],
    );
    const [movements] = await connection.query<RowDataPacket[]>(
      `SELECT id, tipo, concepto, monto FROM personal_pago_movimientos
        WHERE empleado_id = ? AND periodo = ? AND estado = 'PENDIENTE' ORDER BY id`, [employeeId, period],
    );
    const [loans] = await connection.query<RowDataPacket[]>(
      `SELECT id, concepto, LEAST(cuota_mensual, saldo_pendiente) AS installment
         FROM personal_prestamos WHERE empleado_id = ? AND estado = 'ACTIVO' AND periodo_inicio <= ? ORDER BY id`, [employeeId, period],
    );
    const sums = movements.reduce((acc, movement) => {
      const value = Number(movement.monto);
      if (movement.tipo === 'ADELANTO') acc.advances += value;
      else if (movement.tipo === 'OTRO_INGRESO') acc.income += value;
      else acc.discounts += value;
      return acc;
    }, { advances: 0, income: 0, discounts: 0 });
    const loanTotal = loans.reduce((sum, loan) => sum + Number(loan.installment), 0);
    const calculation = calculateServicePayment({
      monthlyPayment: monthlyBase.appliedMonthlyPayment, overtimeMinutes: Number(overtime.minutes || 0),
      overtimeHourlyRate: Number(agreement?.tarifa_hora_extra || 0), otherIncome: sums.income,
      advances: sums.advances, loanInstallments: loanTotal, otherDiscounts: sums.discounts,
    });
    const status = !agreement ? 'CONFIGURACION_PENDIENTE' : calculation.hasExcessDeductions ? 'OBSERVADO' : 'BORRADOR';
    const observation = calculation.hasExcessDeductions ? 'Los descuentos superan el total del servicio.' : null;
    const [insert] = await connection.query<ResultSetHeader>(
      `INSERT INTO personal_liquidaciones_pago
         (periodo_pago_id, empleado_id, sede_id, acuerdo_id, pago_mensual, honorario_mensual_pactado,
          politica_prorrateo, prorrateo_aplicado, dias_periodo, dias_servicio,
          fecha_servicio_desde, fecha_servicio_hasta, factor_prorrateo, minutos_horas_extra,
          monto_horas_extra, otros_ingresos, adelantos, cuotas_prestamo, otros_descuentos,
          total_servicio, total_depositar, estado, observacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [periodId, employeeId, siteId, agreement?.id ?? null, monthlyBase.appliedMonthlyPayment,
        monthlyBase.agreedMonthlyPayment, monthlyBase.policy, monthlyBase.prorated ? 1 : 0,
        monthlyBase.periodDays, monthlyBase.serviceDays, monthlyBase.serviceStart, monthlyBase.serviceEnd,
        monthlyBase.factor, overtime.minutes ?? 0,
        calculation.overtimeAmount, sums.income, sums.advances, loanTotal, sums.discounts,
        calculation.serviceTotal, calculation.depositTotal, status, observation],
    );
    const liquidationId = insert.insertId;
    if (agreement) {
      for (const segment of monthlyBase.segments) {
        const description = segment.prorated || monthlyBase.segments.length > 1
          ? `Honorario del ${segment.serviceStart} al ${segment.serviceEnd} (${segment.serviceDays} de ${segment.periodDays} dias)`
          : 'Pago mensual por servicios';
        await this.addConcept(
          connection, liquidationId, 'PAGO_MENSUAL', description,
          segment.appliedMonthlyPayment, segment.serviceDays, 'dias', 'ACUERDO', segment.agreementId,
        );
      }
      if (calculation.overtimeAmount > 0) await this.addConcept(connection, liquidationId, 'HORAS_EXTRA', 'Horas extras aprobadas', calculation.overtimeAmount, Number(overtime.minutes), 'min', 'SOBRETIEMPO_MENSUAL', null);
    }
    for (const movement of movements) await this.addConcept(connection, liquidationId, movement.tipo, movement.concepto, Number(movement.monto), null, null, 'MOVIMIENTO', Number(movement.id));
    for (const loan of loans) await this.addConcept(connection, liquidationId, 'CUOTA_PRESTAMO', loan.concepto, Number(loan.installment), null, null, 'PRESTAMO', Number(loan.id));
  }

  private async refreshDraftEmployee(
    companyId: number,
    employeeId: number,
    monthValue: unknown,
    actorId: number,
    reason: string,
  ) {
    const period = normalizePaymentMonth(monthValue);
    const end = periodEnd(period);
    await runInTransaction(async connection => {
      const [periodRows] = await connection.query<RowDataPacket[]>(
        `SELECT id, estado FROM personal_periodos_pago
          WHERE empresa_id = ? AND periodo = ? LIMIT 1 FOR UPDATE`,
        [companyId, period],
      );
      if (!periodRows.length || periodRows[0].estado !== 'BORRADOR') return;

      const [employeeRows] = await connection.query<RowDataPacket[]>(
        `SELECT employee.id, employee.sede_id,
                DATE_FORMAT(employee.fecha_ingreso, '%Y-%m-%d') AS fecha_ingreso,
                DATE_FORMAT(employee.fecha_cese, '%Y-%m-%d') AS fecha_cese
           FROM personal_empleados employee
           INNER JOIN sedes site ON site.id = employee.sede_id AND site.empresa_id = ?
          WHERE employee.id = ?
            AND employee.fecha_ingreso <= ?
            AND (employee.fecha_cese IS NULL OR employee.fecha_cese >= ?)
          LIMIT 1 FOR UPDATE`,
        [companyId, employeeId, end, period],
      );
      if (!employeeRows.length) return;

      const periodId = Number(periodRows[0].id);
      await connection.query(
        `DELETE FROM personal_liquidaciones_pago
          WHERE periodo_pago_id = ? AND empleado_id = ? AND rhe_numero IS NULL AND estado <> 'PAGADO'`,
        [periodId, employeeId],
      );
      await this.generateEmployee(
        connection,
        periodId,
        employeeId,
        Number(employeeRows[0].sede_id),
        period,
        end,
        String(employeeRows[0].fecha_ingreso),
        employeeRows[0].fecha_cese ? String(employeeRows[0].fecha_cese) : null,
      );
      await this.audit(connection, 'LIQUIDACION_RECALCULADA_AUTOMATICAMENTE', employeeId, actorId, {
        period_id: periodId,
        period,
        reason,
      });
    });
  }

  private async addConcept(connection: PoolConnection, liquidationId: number, type: string, description: string, value: number, quantity: number | null, unit: string | null, originType: string, originId: number | null) {
    await connection.query(
      `INSERT INTO personal_liquidacion_conceptos
         (liquidacion_id, tipo, descripcion, monto, cantidad, unidad, origen_tipo, origen_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [liquidationId, type, description, value, quantity, unit, originType, originId],
    );
  }

  private async assertSite(companyId: number, siteId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT id FROM sedes WHERE id = ? AND empresa_id = ? LIMIT 1`, [siteId, companyId]);
    if (!rows.length) throw new ServicePaymentError('Sede fuera del alcance autorizado.', 403);
  }

  private async assertEmployee(companyId: number, employeeId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT employee.id FROM personal_empleados employee INNER JOIN sedes site ON site.id = employee.sede_id
        WHERE employee.id = ? AND site.empresa_id = ? LIMIT 1`, [employeeId, companyId],
    );
    if (!rows.length) throw new ServicePaymentError('Colaborador fuera del alcance autorizado.', 403);
  }

  private async audit(connection: { query: Function }, type: string, employeeId: number | null, actorId: number, metadata: Record<string, unknown>) {
    await connection.query(
      `INSERT INTO personal_auditoria_eventos
         (tipo_evento, empleado_id, usuario_id, exitoso, codigo_resultado, metadata_json)
       VALUES (?, ?, ?, 1, 'OK', ?)`, [type, employeeId, actorId, JSON.stringify(metadata)],
    );
  }

  private async transition(connection: { query: Function }, companyId: number, entity: 'PERIODO' | 'LIQUIDACION' | 'LOTE', entityId: number, previousStatus: string | null, nextStatus: string, actorId: number, reason: string | null) {
    await connection.query(
      `INSERT INTO personal_pago_transiciones
         (empresa_id, entidad, entidad_id, estado_anterior, estado_nuevo, motivo, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`, [companyId, entity, entityId, previousStatus, nextStatus, reason, actorId],
    );
  }
}
