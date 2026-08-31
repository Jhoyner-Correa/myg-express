import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../../../core/database/database';
import { businessDate } from '../../../core/utils/time';
import { AttendanceDashboardService } from './AttendanceDashboardService';

type SiteRow = RowDataPacket & { id: number; nombre: string };
type LockRow = RowDataPacket & { acquired: number };

export type AttendanceClosureResult = {
  processed_days: number;
  absences_created: number;
  incomplete_shifts: number;
};

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function boundedLookback(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(31, Math.max(1, parsed)) : 7;
}

export class AttendanceDailyClosureService {
  private readonly dashboard = new AttendanceDashboardService();
  private readonly lookbackDays = boundedLookback(process.env.RRHH_ATTENDANCE_CLOSURE_LOOKBACK_DAYS);
  private readonly enabled = String(process.env.RRHH_ATTENDANCE_CLOSURE_ENABLED || 'true').toLowerCase() !== 'false';

  async closePendingDays(now = new Date()): Promise<AttendanceClosureResult> {
    if (!this.enabled) return { processed_days: 0, absences_created: 0, incomplete_shifts: 0 };

    const lockConnection = await pool.getConnection();
    const [[lock]] = await lockConnection.query<LockRow[]>(
      'SELECT GET_LOCK(?, 0) AS acquired',
      ['myg_rrhh_attendance_daily_closure'],
    );
    if (Number(lock?.acquired) !== 1) {
      lockConnection.release();
      return { processed_days: 0, absences_created: 0, incomplete_shifts: 0 };
    }

    try {
      const [sites] = await pool.query<SiteRow[]>(
        `SELECT id, nombre FROM sedes WHERE estado = 'activo' ORDER BY id`,
      );
      const today = businessDate(now);
      let processedDays = 0;
      let absencesCreated = 0;
      let incompleteShifts = 0;

      for (let offset = 1; offset <= this.lookbackDays; offset += 1) {
        const date = shiftDate(today, -offset);
        for (const site of sites) {
          const dashboard = await this.dashboard.getDailyDashboard(Number(site.id), date, String(site.nombre));
          const scheduled = dashboard.employees.filter(item => item.status !== 'NO_LABORABLE');
          const missing = scheduled.filter(item => item.status === 'SIN_REGISTRO');
          const incomplete = scheduled.filter(item => item.operational_status === 'JORNADA_INCOMPLETA').length;

          const created = await runInTransaction(async connection => {
            let inserted = 0;
            if (missing.length) {
              const values = missing.map(() => '(?, ?, ?, ?, ?)').join(', ');
              const parameters = missing.flatMap(item => [item.employee_id, date, 'FALTA', 'NORMAL', 0]);
              const [result] = await connection.query<ResultSetHeader>(
                `INSERT IGNORE INTO personal_asistencias
                  (empleado_id, fecha, estado_asistencia, tipo_asistencia, minutos_tardanza)
                 VALUES ${values}`,
                parameters,
              );
              inserted = Number(result.affectedRows || 0);
            }

            await connection.query(
              `INSERT INTO personal_cierres_asistencia_diaria
                (sede_id, fecha, personal_programado, faltas_generadas_total,
                 faltas_generadas_ultima_ejecucion, jornadas_incompletas, procesado_en)
               VALUES (?, ?, ?, ?, ?, ?, NOW())
               ON DUPLICATE KEY UPDATE
                 personal_programado = VALUES(personal_programado),
                 faltas_generadas_total = faltas_generadas_total + VALUES(faltas_generadas_total),
                 faltas_generadas_ultima_ejecucion = VALUES(faltas_generadas_ultima_ejecucion),
                 jornadas_incompletas = VALUES(jornadas_incompletas),
                 procesado_en = VALUES(procesado_en)`,
              [site.id, date, scheduled.length, inserted, inserted, incomplete],
            );

            if (inserted > 0 || incomplete > 0) {
              await connection.query(
                `INSERT INTO personal_auditoria_eventos
                  (tipo_evento, empleado_id, usuario_id, dispositivo_id, exitoso,
                   codigo_resultado, metadata_json)
                 VALUES ('CIERRE_DIARIO_ASISTENCIA', NULL, NULL, NULL, 1, 'COMPLETADO', ?)`,
                [JSON.stringify({
                  site_id: Number(site.id),
                  date,
                  scheduled_employees: scheduled.length,
                  absences_created: inserted,
                  incomplete_shifts: incomplete,
                })],
              );
            }
            return inserted;
          });

          processedDays += 1;
          absencesCreated += created;
          incompleteShifts += incomplete;
        }
      }

      return {
        processed_days: processedDays,
        absences_created: absencesCreated,
        incomplete_shifts: incompleteShifts,
      };
    } finally {
      await lockConnection.query('SELECT RELEASE_LOCK(?)', ['myg_rrhh_attendance_daily_closure'])
        .catch(() => undefined);
      lockConnection.release();
    }
  }
}

export const attendanceDailyClosureService = new AttendanceDailyClosureService();
