import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../core/database/database';

const REQUIRED_TABLES = [
  'empresas',
  'sedes',
  'usuarios',
  'roles',
  'permisos',
  'usuario_asignaciones',
  'personal_empleados',
  'personal_empleado_sedes',
  'personal_horario_asignaciones',
  'personal_calendario_laboral',
  'personal_sobretiempo_solicitudes',
  'personal_notificaciones_app',
  'personal_auditoria_eventos',
  'personal_pago_acuerdos',
  'personal_pago_movimientos',
  'personal_prestamos',
  'personal_periodos_pago',
  'personal_liquidaciones_pago',
  'personal_liquidacion_conceptos',
  'personal_lotes_pago',
  'personal_lote_pago_detalles',
  'personal_pago_transiciones',
  'personal_pago_notas',
] as const;

const REQUIRED_MIGRATIONS = [
  '029_rrhh_absence_cancellation',
  '030_rrhh_mobile_notifications',
  '031_rrhh_mobile_permission_requests',
  '032_rrhh_schema_governance',
  '033_rrhh_legacy_retirement',
  '035_rrhh_service_payments',
  '036_rrhh_payment_workflow',
  '037_rrhh_payment_receipt_integrity',
  '038_rrhh_payment_legacy_batches',
  '039_rrhh_payment_employee_ledger',
  '040_rrhh_payment_proration',
  '041_rrhh_overtime_evidence',
] as const;

const RETIRED_TABLES = [
  'personal_empleado_horarios',
  'personal_horas_extras',
  'personal_notificaciones',
  'personal_auditoria_accesos',
] as const;

type CountRow = RowDataPacket & { total: number };

let errors = 0;
let warnings = 0;

function ok(message: string): void {
  console.log(`[OK] ${message}`);
}

function warn(message: string): void {
  warnings += 1;
  console.warn(`[ADVERTENCIA] ${message}`);
}

function fail(message: string): void {
  errors += 1;
  console.error(`[ERROR] ${message}`);
}

async function count(sql: string, values: unknown[] = []): Promise<number> {
  const [[row]] = await pool.query<CountRow[]>(sql, values);
  return Number(row?.total ?? 0);
}

async function main(): Promise<void> {
  const [tableRows] = await pool.query<RowDataPacket[]>(
    `SELECT TABLE_NAME AS table_name
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()`,
  );
  const tables = new Set(tableRows.map(row => String(row.table_name)));

  for (const table of REQUIRED_TABLES) {
    if (tables.has(table)) ok(`Tabla canónica disponible: ${table}`);
    else fail(`Falta la tabla canónica ${table}.`);
  }

  if (!tables.has('schema_migrations')) {
    fail('No existe schema_migrations; no se puede demostrar qué versión está desplegada.');
  } else {
    const [migrationRows] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM schema_migrations WHERE id IN (?)',
      [[...REQUIRED_MIGRATIONS]],
    );
    const applied = new Set(migrationRows.map(row => String(row.id)));
    for (const migration of REQUIRED_MIGRATIONS) {
      if (applied.has(migration)) ok(`Migración registrada: ${migration}`);
      else fail(`La migración ${migration} no figura en schema_migrations.`);
    }
  }

  if (tables.has('personal_empleado_sedes')) {
    const activeWithoutOneSite = await count(
      `SELECT COUNT(*) AS total
         FROM personal_empleados employee
         LEFT JOIN (
           SELECT empleado_id, COUNT(*) AS open_count
             FROM personal_empleado_sedes
            WHERE vigente_hasta IS NULL
            GROUP BY empleado_id
         ) assignment ON assignment.empleado_id = employee.id
        WHERE employee.estado = 'ACTIVO'
          AND COALESCE(assignment.open_count, 0) <> 1`,
    );
    if (activeWithoutOneSite) {
      fail(`${activeWithoutOneSite} colaborador(es) activo(s) no tienen exactamente una sede vigente.`);
    } else {
      ok('Cada colaborador activo tiene una sola sede vigente.');
    }

    const projectionMismatch = await count(
      `SELECT COUNT(*) AS total
         FROM personal_empleados employee
         INNER JOIN personal_empleado_sedes assignment
           ON assignment.empleado_id = employee.id
          AND assignment.vigente_hasta IS NULL
        WHERE employee.sede_id <> assignment.sede_id`,
    );
    if (projectionMismatch) {
      fail(`${projectionMismatch} colaborador(es) difieren entre su sede actual y su historial vigente.`);
    } else {
      ok('La sede operativa coincide con el historial laboral vigente.');
    }

    const overlappingSites = await count(
      `SELECT COUNT(*) AS total
         FROM personal_empleado_sedes first_assignment
         INNER JOIN personal_empleado_sedes second_assignment
           ON second_assignment.empleado_id = first_assignment.empleado_id
          AND second_assignment.id > first_assignment.id
          AND second_assignment.vigente_desde <= COALESCE(first_assignment.vigente_hasta, '9999-12-31')
          AND first_assignment.vigente_desde <= COALESCE(second_assignment.vigente_hasta, '9999-12-31')`,
    );
    if (overlappingSites) fail(`Hay ${overlappingSites} cruce(s) en el historial de sedes.`);
    else ok('El historial de sedes no contiene periodos superpuestos.');
  }

  if (tables.has('personal_horario_asignaciones')) {
    const invalidSchedules = await count(
      `SELECT COUNT(*) AS total
         FROM personal_horario_asignaciones
        WHERE dia_semana NOT BETWEEN 1 AND 7
           OR (vigente_hasta IS NOT NULL AND vigente_hasta < vigente_desde)`,
    );
    if (invalidSchedules) fail(`Hay ${invalidSchedules} asignación(es) de horario inválida(s).`);
    else ok('Las asignaciones de horario tienen días y periodos válidos.');

    const overlappingSchedules = await count(
      `SELECT COUNT(*) AS total
         FROM personal_horario_asignaciones first_assignment
         INNER JOIN personal_horario_asignaciones second_assignment
           ON second_assignment.id > first_assignment.id
          AND second_assignment.alcance = first_assignment.alcance
          AND second_assignment.dia_semana = first_assignment.dia_semana
          AND COALESCE(second_assignment.sede_id, 0) = COALESCE(first_assignment.sede_id, 0)
          AND COALESCE(second_assignment.empleado_id, 0) = COALESCE(first_assignment.empleado_id, 0)
          AND second_assignment.vigente_desde <= COALESCE(first_assignment.vigente_hasta, '9999-12-31')
          AND first_assignment.vigente_desde <= COALESCE(second_assignment.vigente_hasta, '9999-12-31')`,
    );
    if (overlappingSchedules) {
      warn(`Hay ${overlappingSchedules} cruce(s) de vigencia en horarios; deben revisarse antes de endurecer restricciones.`);
    } else {
      ok('No se detectaron cruces de vigencia en horarios.');
    }
  }

  if (tables.has('personal_acceso_app')) {
    const [columnRows] = await pool.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME AS column_name
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'personal_acceso_app'
          AND COLUMN_NAME IN ('token_actual', 'refresh_token')`,
    );
    const columns = columnRows.map(row => `\`${String(row.column_name)}\``);
    if (columns.length) {
      const plaintextTokens = await count(
        `SELECT COUNT(*) AS total FROM personal_acceso_app WHERE ${columns.map(column => `${column} IS NOT NULL`).join(' OR ')}`,
      );
      if (plaintextTokens) fail(`${plaintextTokens} acceso(s) móvil(es) conservan tokens legados en texto plano.`);
      else ok('No quedan tokens móviles legados en texto plano.');
    }
  }

  if (tables.has('personal_lotes_pago') && tables.has('personal_lote_pago_detalles')) {
    const paymentsOutsideBatch = await count(
      `SELECT COUNT(*) AS total
         FROM personal_liquidaciones_pago liquidation
         LEFT JOIN personal_lote_pago_detalles detail ON detail.liquidacion_id = liquidation.id
        WHERE liquidation.estado IN ('EN_LOTE','PAGADO') AND detail.id IS NULL`,
    );
    if (paymentsOutsideBatch) fail(`${paymentsOutsideBatch} pago(s) procesados no pertenecen a un lote bancario.`);
    else ok('Todos los pagos procesados pertenecen a un lote bancario auditable.');

    const inconsistentBatches = await count(
      `SELECT COUNT(*) AS total FROM (
         SELECT batch.id
           FROM personal_lotes_pago batch
           LEFT JOIN personal_lote_pago_detalles detail ON detail.lote_pago_id = batch.id
          GROUP BY batch.id, batch.cantidad_pagos, batch.total_depositar
         HAVING COUNT(detail.id) <> batch.cantidad_pagos
             OR ABS(COALESCE(SUM(detail.monto), 0) - batch.total_depositar) > 0.01
       ) inconsistencies`,
    );
    if (inconsistentBatches) fail(`${inconsistentBatches} lote(s) presentan diferencias entre cabecera y detalle.`);
    else ok('Los lotes bancarios concilian cantidad e importe con sus detalles.');
  }

  for (const table of RETIRED_TABLES) {
    if (tables.has(table)) fail(`La tabla heredada ${table} todavía existe.`);
    else ok(`Tabla heredada retirada: ${table}`);
  }

  console.log(`\nAuditoría terminada: ${errors} error(es), ${warnings} advertencia(s).`);
  if (errors) process.exitCode = 1;
}

void main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());
