import bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../../core/database/database';
import { assertSupportedDevicePublicKey } from '../rrhh/domain/mobileSignature';
import { createMobileAccessToken, createRefreshToken, hashOpaqueToken } from './mobileTokens';

const SESSION_DAYS = 30;

class MobileAuthError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode: number) {
    super(message);
  }
}

type EmployeeAccessRow = RowDataPacket & {
  id: number;
  codigo_empleado: string;
  dni: string;
  nombres: string;
  apellidos: string;
  sede_id: number;
  estado: string;
  password_hash: string;
  requiere_cambio_clave: number;
};

type SessionRow = RowDataPacket & {
  id: number;
  empleado_id: number;
  dispositivo_id: number;
  expira_en: Date;
};

export interface ActivateDeviceInput {
  identifier: string;
  password: string;
  activationCode: string;
  installationId: string;
  publicKey: string;
  brand?: string;
  model?: string;
  osVersion?: string;
  appVersion?: string;
  ipAddress?: string | null;
}

function validateActivationInput(input: ActivateDeviceInput) {
  if (!/^[A-Za-z0-9._-]{3,80}$/.test(input.identifier.trim())) {
    throw new MobileAuthError('INVALID_INPUT', 'Usuario, DNI o codigo no valido.', 400);
  }
  if (!input.password || input.password.length > 200) {
    throw new MobileAuthError('INVALID_INPUT', 'Contrasena no valida.', 400);
  }
  if (!/^\d{8}$/.test(input.activationCode)) {
    throw new MobileAuthError('ACTIVATION_INVALID', 'Codigo de activacion no valido.', 401);
  }
  if (!/^[A-Za-z0-9._:-]{16,255}$/.test(input.installationId)) {
    throw new MobileAuthError('INVALID_DEVICE', 'Identificador del dispositivo no valido.', 400);
  }
  if (input.publicKey.length > 5000) {
    throw new MobileAuthError('INVALID_DEVICE_KEY', 'Clave publica no valida.', 400);
  }
  try {
    assertSupportedDevicePublicKey(input.publicKey);
  } catch (error) {
    throw new MobileAuthError('INVALID_DEVICE_KEY', error instanceof Error ? error.message : 'Clave publica no valida.', 400);
  }
}

function issueSession(employeeId: number, deviceId: number, sessionId: number, refreshToken: string) {
  return {
    access_token: createMobileAccessToken(employeeId, deviceId, sessionId),
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: 900,
  };
}

export class MobileAuthService {
  async createActivation(employeeId: number, creatorUserId: number, temporaryPassword?: string) {
    const employee = await pool.query<RowDataPacket[]>(
      'SELECT id FROM personal_empleados WHERE id = ? AND estado = \'ACTIVO\' LIMIT 1',
      [employeeId],
    );
    if (!employee[0].length) throw new MobileAuthError('EMPLOYEE_NOT_FOUND', 'Empleado activo no encontrado.', 404);

    const generatedPassword = temporaryPassword || `MyG-${randomInt(100000, 999999)}!`;
    if (generatedPassword.length < 10) {
      throw new MobileAuthError('WEAK_PASSWORD', 'La contrasena temporal debe tener al menos 10 caracteres.', 400);
    }
    const activationCode = String(randomInt(10_000_000, 100_000_000));
    const passwordHash = await bcrypt.hash(generatedPassword, 12);
    const activationHash = hashOpaqueToken(activationCode);

    await runInTransaction(async connection => {
      await connection.query(
        `INSERT INTO personal_acceso_app (empleado_id, password_hash, requiere_cambio_clave)
         VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), requiere_cambio_clave = 1,
           token_actual = NULL, refresh_token = NULL`,
        [employeeId, passwordHash],
      );
      await connection.query(
        'UPDATE personal_activaciones_dispositivo SET usado_en = NOW() WHERE empleado_id = ? AND usado_en IS NULL',
        [employeeId],
      );
      await connection.query(
        `INSERT INTO personal_activaciones_dispositivo (empleado_id, codigo_hash, expira_en, creado_por)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE), ?)`,
        [employeeId, activationHash, creatorUserId],
      );
      await connection.query(
        `INSERT INTO personal_auditoria_eventos (
          tipo_evento, empleado_id, usuario_id, exitoso, codigo_resultado, metadata_json
        ) VALUES ('CREACION_ACTIVACION', ?, ?, 1, 'CREADA', ?)`,
        [employeeId, creatorUserId, JSON.stringify({ expires_in_seconds: 900 })],
      );
    });

    return {
      temporary_password: generatedPassword,
      activation_code: activationCode,
      expires_in_seconds: 900,
    };
  }

  async activateDevice(input: ActivateDeviceInput) {
    validateActivationInput(input);
    const [employeeRows] = await pool.query<EmployeeAccessRow[]>(
      `SELECT employee.id, employee.codigo_empleado, employee.dni, employee.nombres,
              employee.apellidos, employee.sede_id, employee.estado,
              access.password_hash, access.requiere_cambio_clave
         FROM personal_empleados employee
         INNER JOIN personal_acceso_app access ON access.empleado_id = employee.id
        WHERE employee.codigo_empleado = ? OR employee.dni = ?
        LIMIT 1`,
      [input.identifier.trim(), input.identifier.trim()],
    );
    const employee = employeeRows[0];
    const passwordOk = employee ? await bcrypt.compare(input.password, employee.password_hash) : false;
    if (!employee || !passwordOk || employee.estado !== 'ACTIVO') {
      throw new MobileAuthError('CREDENTIALS_INVALID', 'Credenciales incorrectas.', 401);
    }

    const refreshToken = createRefreshToken();
    const activationHash = hashOpaqueToken(input.activationCode);
    const result = await runInTransaction(async connection => {
      const [activationRows] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM personal_activaciones_dispositivo
          WHERE empleado_id = ? AND codigo_hash = ? AND usado_en IS NULL AND expira_en > NOW()
          LIMIT 1 FOR UPDATE`,
        [employee.id, activationHash],
      );
      if (!activationRows.length) {
        throw new MobileAuthError('ACTIVATION_INVALID', 'El codigo de activacion es incorrecto o expiro.', 401);
      }

      const [authorizedRows] = await connection.query<RowDataPacket[]>(
        `SELECT id, device_id FROM personal_dispositivos
          WHERE empleado_id = ? AND estado = 'AUTORIZADO' LIMIT 1 FOR UPDATE`,
        [employee.id],
      );
      if (authorizedRows.length && authorizedRows[0].device_id !== input.installationId) {
        throw new MobileAuthError('DEVICE_ALREADY_BOUND', 'El empleado ya tiene otro celular autorizado.', 409);
      }

      const [deviceOwnerRows] = await connection.query<RowDataPacket[]>(
        'SELECT id, empleado_id FROM personal_dispositivos WHERE device_id = ? LIMIT 1 FOR UPDATE',
        [input.installationId],
      );
      if (deviceOwnerRows.length && Number(deviceOwnerRows[0].empleado_id) !== employee.id) {
        throw new MobileAuthError('DEVICE_ALREADY_BOUND', 'Este celular pertenece a otro empleado.', 409);
      }

      let deviceId: number;
      if (deviceOwnerRows.length) {
        deviceId = Number(deviceOwnerRows[0].id);
        await connection.query(
          `UPDATE personal_dispositivos SET clave_publica = ?, algoritmo_clave = 'ECDSA_P256_SHA256',
             biometria_registrada_en = NOW(), marca = ?, modelo = ?, version_android = ?, version_app = ?,
             estado = 'AUTORIZADO', autorizado_en = NOW(), revocado_en = NULL, motivo_revocacion = NULL
           WHERE id = ?`,
          [input.publicKey, input.brand || null, input.model || null, input.osVersion || null, input.appVersion || null, deviceId],
        );
      } else {
        const [deviceResult] = await connection.query<ResultSetHeader>(
          `INSERT INTO personal_dispositivos (
            empleado_id, device_id, clave_publica, algoritmo_clave, biometria_registrada_en,
            marca, modelo, version_android, version_app, estado, autorizado_en
          ) VALUES (?, ?, ?, 'ECDSA_P256_SHA256', NOW(), ?, ?, ?, ?, 'AUTORIZADO', NOW())`,
          [employee.id, input.installationId, input.publicKey, input.brand || null, input.model || null, input.osVersion || null, input.appVersion || null],
        );
        deviceId = deviceResult.insertId;
      }

      await connection.query('UPDATE personal_activaciones_dispositivo SET usado_en = NOW() WHERE id = ?', [activationRows[0].id]);
      await connection.query('UPDATE personal_sesiones_app SET revocado_en = NOW() WHERE empleado_id = ? AND revocado_en IS NULL', [employee.id]);
      const [sessionResult] = await connection.query<ResultSetHeader>(
        `INSERT INTO personal_sesiones_app (
          empleado_id, dispositivo_id, refresh_token_hash, expira_en, ip_creacion
        ) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), ?)`,
        [employee.id, deviceId, hashOpaqueToken(refreshToken), SESSION_DAYS, input.ipAddress || null],
      );
      await connection.query('UPDATE personal_acceso_app SET ultimo_login = NOW() WHERE empleado_id = ?', [employee.id]);
      await connection.query(
        `INSERT INTO personal_auditoria_eventos (
          tipo_evento, empleado_id, dispositivo_id, exitoso, codigo_resultado, ip_address, metadata_json
        ) VALUES ('ACTIVACION_DISPOSITIVO', ?, ?, 1, 'AUTORIZADO', ?, ?)`,
        [employee.id, deviceId, input.ipAddress || null, JSON.stringify({ installation_id: input.installationId })],
      );

      return { deviceId, sessionId: sessionResult.insertId };
    });

    return {
      ...issueSession(employee.id, result.deviceId, result.sessionId, refreshToken),
      requires_password_change: Boolean(employee.requiere_cambio_clave),
      employee: {
        id: employee.id,
        code: employee.codigo_empleado,
        first_name: employee.nombres,
        last_name: employee.apellidos,
        sede_id: employee.sede_id,
      },
    };
  }

  async refresh(rawRefreshToken: string) {
    if (!rawRefreshToken || rawRefreshToken.length < 40 || rawRefreshToken.length > 200) {
      throw new MobileAuthError('REFRESH_INVALID', 'Sesion no valida.', 401);
    }
    const nextRefreshToken = createRefreshToken();
    const result = await runInTransaction(async connection => {
      const [rows] = await connection.query<SessionRow[]>(
        `SELECT session.id, session.empleado_id, session.dispositivo_id, session.expira_en
           FROM personal_sesiones_app session
           INNER JOIN personal_empleados employee ON employee.id = session.empleado_id
           INNER JOIN personal_dispositivos device ON device.id = session.dispositivo_id
          WHERE session.refresh_token_hash = ? AND session.revocado_en IS NULL
            AND session.expira_en > NOW() AND employee.estado = 'ACTIVO' AND device.estado = 'AUTORIZADO'
          LIMIT 1 FOR UPDATE`,
        [hashOpaqueToken(rawRefreshToken)],
      );
      if (!rows.length) throw new MobileAuthError('REFRESH_INVALID', 'La sesion ya no es valida.', 401);
      const session = rows[0];
      await connection.query(
        'UPDATE personal_sesiones_app SET refresh_token_hash = ?, ultimo_uso_en = NOW(), expira_en = DATE_ADD(NOW(), INTERVAL ? DAY) WHERE id = ?',
        [hashOpaqueToken(nextRefreshToken), SESSION_DAYS, session.id],
      );
      return session;
    });
    return issueSession(result.empleado_id, result.dispositivo_id, result.id, nextRefreshToken);
  }

  async logout(sessionId: number) {
    await pool.query('UPDATE personal_sesiones_app SET revocado_en = NOW() WHERE id = ?', [sessionId]);
  }

  async revokeEmployeeDevice(employeeId: number, actorUserId: number, reason: string, ipAddress?: string | null) {
    if (!reason.trim() || reason.trim().length > 255) {
      throw new MobileAuthError('INVALID_REASON', 'Indica un motivo de revocacion valido.', 400);
    }
    await runInTransaction(async connection => {
      const [devices] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM personal_dispositivos
          WHERE empleado_id = ? AND estado = 'AUTORIZADO' FOR UPDATE`,
        [employeeId],
      );
      if (!devices.length) throw new MobileAuthError('DEVICE_NOT_FOUND', 'El empleado no tiene un celular autorizado.', 404);
      await connection.query(
        `UPDATE personal_dispositivos
            SET estado = 'BLOQUEADO', revocado_por = ?, revocado_en = NOW(), motivo_revocacion = ?
          WHERE empleado_id = ? AND estado = 'AUTORIZADO'`,
        [actorUserId, reason.trim(), employeeId],
      );
      await connection.query(
        'UPDATE personal_sesiones_app SET revocado_en = NOW() WHERE empleado_id = ? AND revocado_en IS NULL',
        [employeeId],
      );
      await connection.query(
        `INSERT INTO personal_auditoria_eventos (
          tipo_evento, empleado_id, usuario_id, exitoso, codigo_resultado, ip_address, metadata_json
        ) VALUES ('REVOCACION_DISPOSITIVO', ?, ?, 1, 'REVOCADO', ?, ?)`,
        [employeeId, actorUserId, ipAddress || null, JSON.stringify({ reason: reason.trim() })],
      );
    });
  }
}

export function mobileAuthStatus(error: unknown): number {
  return error instanceof MobileAuthError ? error.statusCode : 400;
}

export function mobileAuthCode(error: unknown): string {
  return error instanceof MobileAuthError ? error.code : 'MOBILE_AUTH_ERROR';
}
