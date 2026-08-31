import { Response } from 'express';
import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool } from '../../core/database/database';
import {
  EmployeePhotoError,
  EmployeePhotoStorageService,
} from '../rrhh/services/EmployeePhotoStorageService';
import { MobileAuthRequest } from './mobileAuth.middleware';

type EmployeePhotoRow = RowDataPacket & { foto: string | null };

export class MobileProfileController {
  private readonly photoStorage = new EmployeePhotoStorageService();

  updatePhoto = async (req: MobileAuthRequest, res: Response) => {
    let storedPhoto: string | null = null;
    let connection: PoolConnection | null = null;

    try {
      if (!req.employee) {
        return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED', message: 'Sesion requerida.' });
      }
      if (!req.file) {
        throw new EmployeePhotoError(
          'EMPLOYEE_PHOTO_REQUIRED',
          'Selecciona una foto para continuar.',
        );
      }

      storedPhoto = await this.photoStorage.save(req.file.buffer, req.file.mimetype);
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [rows] = await connection.query<EmployeePhotoRow[]>(
        `SELECT foto
           FROM personal_empleados
          WHERE id = ? AND estado = 'ACTIVO'
          LIMIT 1
          FOR UPDATE`,
        [req.employee.id],
      );
      if (!rows.length) {
        throw new EmployeePhotoError('EMPLOYEE_NOT_FOUND', 'Colaborador activo no encontrado.', 404);
      }

      const previousPhoto = rows[0].foto;
      await connection.query(
        'UPDATE personal_empleados SET foto = ? WHERE id = ?',
        [storedPhoto, req.employee.id],
      );
      await connection.query(
        `INSERT INTO personal_auditoria_eventos
          (tipo_evento, empleado_id, dispositivo_id, exitoso, codigo_resultado, ip_address, metadata_json)
         VALUES ('FOTO_PERFIL_EMPLEADO', ?, ?, 1, 'UPDATED', ?, ?)`,
        [
          req.employee.id,
          req.employee.deviceId,
          req.ip || null,
          JSON.stringify({ action: 'UPDATED', source: 'MOBILE_APP', session_id: req.employee.sessionId }),
        ],
      );
      await connection.commit();

      if (previousPhoto && previousPhoto !== storedPhoto) {
        await this.photoStorage.removeManaged(previousPhoto).catch((error) => {
          console.warn('[RRHH Mobile] No se pudo retirar la foto anterior:', error);
        });
      }

      return res.json({
        ok: true,
        message: 'Foto de perfil actualizada correctamente.',
        data: { photo: storedPhoto },
      });
    } catch (error) {
      await connection?.rollback().catch(() => undefined);
      if (storedPhoto) {
        await this.photoStorage.removeManaged(storedPhoto).catch(() => undefined);
      }
      const statusCode = error instanceof EmployeePhotoError ? error.statusCode : 500;
      console.error('[RRHH Mobile] Error actualizando foto de perfil:', error);
      return res.status(statusCode).json({
        ok: false,
        code: error instanceof EmployeePhotoError ? error.code : 'EMPLOYEE_PHOTO_UPDATE_ERROR',
        message: error instanceof Error ? error.message : 'No se pudo actualizar la foto de perfil.',
      });
    } finally {
      connection?.release();
    }
  };
}
