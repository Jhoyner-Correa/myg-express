import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../../../core/database/database';
import { EmployeeStatus } from '../domain/Empleado';

export class EmployeeProfileError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
  }
}

function parseMetadata(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  try {
    return JSON.parse(String(value)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export class EmployeeOperationalProfileService {
  async recordProfilePhotoChange(
    employeeId: number,
    action: 'UPDATED' | 'REMOVED',
    actorUserId: number,
    ipAddress?: string | null,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO personal_auditoria_eventos
        (tipo_evento, empleado_id, usuario_id, exitoso, codigo_resultado, ip_address, metadata_json)
       VALUES ('FOTO_PERFIL_EMPLEADO', ?, ?, 1, ?, ?, ?)`,
      [employeeId, actorUserId, action, ipAddress || null, JSON.stringify({ action })],
    );
  }

  async getProfile(employeeId: number) {
    const [[employeeRows], [summaryRows], [attendanceRows], [deviceRows], [auditRows]] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT employee.id, employee.codigo_empleado, employee.sede_id, employee.cargo_id,
                employee.dni, employee.ruc, employee.nombres, employee.apellidos, employee.sexo,
                employee.telefono, employee.email, employee.direccion, employee.foto, employee.fecha_ingreso,
                employee.fecha_cese, employee.tipo_rastreo, employee.estado, employee.observaciones,
                employee.created_at, employee.updated_at, role.nombre AS cargo_nombre,
                site.nombre AS sede_nombre
           FROM personal_empleados employee
           INNER JOIN personal_cargos role ON role.id = employee.cargo_id
           INNER JOIN sedes site ON site.id = employee.sede_id
          WHERE employee.id = ?
          LIMIT 1`,
        [employeeId],
      ),
      pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total_days,
                SUM(attendance.estado_asistencia = 'PRESENTE') AS present_days,
                SUM(attendance.estado_asistencia = 'TARDANZA') AS late_days,
                SUM(attendance.estado_asistencia = 'FALTA') AS absent_days,
                COALESCE(SUM(attendance.minutos_tardanza), 0) AS delay_minutes,
                MAX(attendance.fecha) AS last_attendance_date
           FROM personal_asistencias attendance
          WHERE attendance.empleado_id = ?
            AND attendance.fecha >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)`,
        [employeeId],
      ),
      pool.query<RowDataPacket[]>(
        `SELECT attendance.id,
                DATE_FORMAT(attendance.fecha, '%Y-%m-%d') AS date,
                attendance.estado_asistencia AS status,
                attendance.tipo_asistencia AS attendance_type,
                attendance.minutos_tardanza AS delay_minutes,
                MAX(CASE WHEN mark.tipo_marcacion = 'ENTRADA' THEN DATE_FORMAT(mark.hora_marcacion, '%Y-%m-%dT%H:%i:%s') END) AS entry_at,
                MAX(CASE WHEN mark.tipo_marcacion = 'SALIDA_ALMUERZO' THEN DATE_FORMAT(mark.hora_marcacion, '%Y-%m-%dT%H:%i:%s') END) AS lunch_out_at,
                MAX(CASE WHEN mark.tipo_marcacion = 'REGRESO' THEN DATE_FORMAT(mark.hora_marcacion, '%Y-%m-%dT%H:%i:%s') END) AS lunch_return_at,
                MAX(CASE WHEN mark.tipo_marcacion = 'SALIDA' THEN DATE_FORMAT(mark.hora_marcacion, '%Y-%m-%dT%H:%i:%s') END) AS exit_at
           FROM personal_asistencias attendance
           LEFT JOIN personal_marcaciones mark ON mark.asistencia_id = attendance.id
          WHERE attendance.empleado_id = ?
          GROUP BY attendance.id, attendance.fecha, attendance.estado_asistencia,
                   attendance.tipo_asistencia, attendance.minutos_tardanza
          ORDER BY attendance.fecha DESC, attendance.id DESC
          LIMIT 15`,
        [employeeId],
      ),
      pool.query<RowDataPacket[]>(
        `SELECT device.id, device.device_id, device.marca AS brand, device.modelo AS model,
                device.version_android AS os_version, device.version_app AS app_version,
                device.estado AS status, device.biometria_registrada_en AS biometric_registered_at,
                device.autorizado_en AS authorized_at, device.revocado_en AS revoked_at,
                device.motivo_revocacion AS revocation_reason, device.ultimo_acceso AS last_access_at,
                (SELECT COUNT(*) FROM personal_sesiones_app session
                  WHERE session.empleado_id = device.empleado_id
                    AND session.dispositivo_id = device.id
                    AND session.revocado_en IS NULL AND session.expira_en > NOW()) AS active_sessions
           FROM personal_dispositivos device
          WHERE device.empleado_id = ?
          ORDER BY (device.estado = 'AUTORIZADO') DESC, device.updated_at DESC, device.id DESC
          LIMIT 1`,
        [employeeId],
      ),
      pool.query<RowDataPacket[]>(
        `SELECT audit.id, audit.tipo_evento AS event_type, audit.exitoso AS successful,
                audit.codigo_resultado AS result_code, audit.metadata_json AS metadata,
                audit.created_at, user.nombre AS actor_name
           FROM personal_auditoria_eventos audit
           LEFT JOIN usuarios user ON user.id = audit.usuario_id
          WHERE audit.empleado_id = ?
          ORDER BY audit.created_at DESC, audit.id DESC
          LIMIT 20`,
        [employeeId],
      ),
    ]);

    if (!employeeRows.length) {
      throw new EmployeeProfileError('EMPLOYEE_NOT_FOUND', 'El colaborador no existe.', 404);
    }

    const employee = employeeRows[0];
    const summary = summaryRows[0] ?? {};
    return {
      employee: {
        id: Number(employee.id),
        code: String(employee.codigo_empleado),
        site_id: Number(employee.sede_id),
        site_name: String(employee.sede_nombre),
        role_id: Number(employee.cargo_id),
        role_name: String(employee.cargo_nombre),
        document: String(employee.dni),
        ruc: employee.ruc ? String(employee.ruc) : null,
        first_names: String(employee.nombres),
        last_names: String(employee.apellidos),
        gender: String(employee.sexo),
        phone: employee.telefono ? String(employee.telefono) : null,
        email: employee.email ? String(employee.email) : null,
        address: String(employee.direccion || ''),
        photo: employee.foto ? String(employee.foto) : null,
        admission_date: employee.fecha_ingreso,
        termination_date: employee.fecha_cese,
        tracking_type: String(employee.tipo_rastreo),
        status: String(employee.estado),
        notes: employee.observaciones ? String(employee.observaciones) : null,
        created_at: employee.created_at,
        updated_at: employee.updated_at,
      },
      attendance: {
        period_days: 90,
        total_days: Number(summary.total_days || 0),
        present_days: Number(summary.present_days || 0),
        late_days: Number(summary.late_days || 0),
        absent_days: Number(summary.absent_days || 0),
        delay_minutes: Number(summary.delay_minutes || 0),
        last_attendance_date: summary.last_attendance_date ?? null,
        recent: attendanceRows.map(row => ({
          id: Number(row.id),
          date: String(row.date),
          status: String(row.status),
          attendance_type: String(row.attendance_type),
          delay_minutes: Number(row.delay_minutes || 0),
          entry_at: row.entry_at ? String(row.entry_at) : null,
          lunch_out_at: row.lunch_out_at ? String(row.lunch_out_at) : null,
          lunch_return_at: row.lunch_return_at ? String(row.lunch_return_at) : null,
          exit_at: row.exit_at ? String(row.exit_at) : null,
        })),
      },
      mobile: deviceRows.length ? {
        id: Number(deviceRows[0].id),
        installation_id: String(deviceRows[0].device_id),
        brand: deviceRows[0].brand ? String(deviceRows[0].brand) : null,
        model: deviceRows[0].model ? String(deviceRows[0].model) : null,
        os_version: deviceRows[0].os_version ? String(deviceRows[0].os_version) : null,
        app_version: deviceRows[0].app_version ? String(deviceRows[0].app_version) : null,
        status: String(deviceRows[0].status),
        biometric_registered_at: deviceRows[0].biometric_registered_at ?? null,
        authorized_at: deviceRows[0].authorized_at ?? null,
        revoked_at: deviceRows[0].revoked_at ?? null,
        revocation_reason: deviceRows[0].revocation_reason ? String(deviceRows[0].revocation_reason) : null,
        last_access_at: deviceRows[0].last_access_at ?? null,
        active_sessions: Number(deviceRows[0].active_sessions || 0),
      } : null,
      audit: auditRows.map(row => ({
        id: Number(row.id),
        event_type: String(row.event_type),
        successful: Boolean(row.successful),
        result_code: String(row.result_code),
        actor_name: row.actor_name ? String(row.actor_name) : null,
        metadata: parseMetadata(row.metadata),
        created_at: row.created_at,
      })),
    };
  }

  async changeStatus(
    employeeId: number,
    status: EmployeeStatus,
    reason: string,
    actorUserId: number,
    ipAddress?: string | null,
  ) {
    if (!['ACTIVO', 'INACTIVO', 'SUSPENDIDO'].includes(status)) {
      throw new EmployeeProfileError('INVALID_EMPLOYEE_STATUS', 'El estado solicitado no es válido.');
    }
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 3 || normalizedReason.length > 255) {
      throw new EmployeeProfileError('INVALID_REASON', 'Indica un motivo de 3 a 255 caracteres.');
    }

    return runInTransaction(async connection => {
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT estado FROM personal_empleados WHERE id = ? LIMIT 1 FOR UPDATE',
        [employeeId],
      );
      if (!rows.length) throw new EmployeeProfileError('EMPLOYEE_NOT_FOUND', 'El colaborador no existe.', 404);
      const previousStatus = String(rows[0].estado) as EmployeeStatus;
      if (previousStatus === status) return { status, previous_status: previousStatus, mobile_access_revoked: false, unchanged: true };

      const [updateResult] = await connection.query<ResultSetHeader>(
        `UPDATE personal_empleados
            SET estado = ?,
                fecha_cese = CASE
                  WHEN ? = 'INACTIVO' THEN COALESCE(fecha_cese, CURDATE())
                  WHEN ? = 'ACTIVO' THEN NULL
                  ELSE fecha_cese
                END
          WHERE id = ?`,
        [status, status, status, employeeId],
      );
      if (!updateResult.affectedRows) throw new EmployeeProfileError('EMPLOYEE_NOT_FOUND', 'El colaborador no existe.', 404);

      let mobileAccessRevoked = false;
      if (status !== 'ACTIVO') {
        const [deviceResult] = await connection.query<ResultSetHeader>(
          `UPDATE personal_dispositivos
              SET estado = 'BLOQUEADO', revocado_por = ?, revocado_en = NOW(), motivo_revocacion = ?
            WHERE empleado_id = ? AND estado = 'AUTORIZADO'`,
          [actorUserId, `Cambio de estado: ${normalizedReason}`.slice(0, 255), employeeId],
        );
        mobileAccessRevoked = deviceResult.affectedRows > 0;
        await connection.query(
          'UPDATE personal_sesiones_app SET revocado_en = NOW() WHERE empleado_id = ? AND revocado_en IS NULL',
          [employeeId],
        );
      }

      await connection.query(
        `INSERT INTO personal_auditoria_eventos
          (tipo_evento, empleado_id, usuario_id, exitoso, codigo_resultado, ip_address, metadata_json)
         VALUES ('CAMBIO_ESTADO_EMPLEADO', ?, ?, 1, ?, ?, ?)`,
        [employeeId, actorUserId, status, ipAddress || null, JSON.stringify({
          previous_status: previousStatus,
          status,
          reason: normalizedReason,
          mobile_access_revoked: mobileAccessRevoked,
        })],
      );

      return { status, previous_status: previousStatus, mobile_access_revoked: mobileAccessRevoked, unchanged: false };
    });
  }
}
