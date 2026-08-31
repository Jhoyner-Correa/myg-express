import bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import { pool } from '../../core/database/database';
import { MobileAuthRequest } from './mobileAuth.middleware';
import { MobileAuthService, mobileAuthCode, mobileAuthStatus } from './mobileAuth.service';

export class MobileAuthController {
  constructor(private authService: MobileAuthService) {}

  preActivate = async (req: Request, res: Response) => {
    try {
      const result = await this.authService.verifyActivation({
        identifier: String(req.body.identifier || ''),
        password: String(req.body.password || ''),
        activationCode: String(req.body.activation_code || ''),
        installationId: String(req.body.installation_id || ''),
      });
      return res.json({ ok: true, data: result });
    } catch (error) {
      return res.status(mobileAuthStatus(error)).json({
        ok: false,
        code: mobileAuthCode(error),
        message: error instanceof Error ? error.message : 'No se pudieron verificar las credenciales.',
      });
    }
  };

  activate = async (req: Request, res: Response) => {
    try {
      const result = await this.authService.activateDevice({
        enrollmentToken: String(req.body.enrollment_token || ''),
        publicKey: String(req.body.public_key || ''),
        brand: req.body.brand,
        model: req.body.model,
        osVersion: req.body.os_version,
        appVersion: req.body.app_version,
        ipAddress: req.ip,
      });
      return res.status(201).json({ ok: true, data: result });
    } catch (error) {
      return res.status(mobileAuthStatus(error)).json({
        ok: false,
        code: mobileAuthCode(error),
        message: error instanceof Error ? error.message : 'No se pudo activar el dispositivo.',
      });
    }
  };

  refresh = async (req: Request, res: Response) => {
    try {
      return res.json({ ok: true, data: await this.authService.refresh(String(req.body.refresh_token || '')) });
    } catch (error) {
      return res.status(mobileAuthStatus(error)).json({ ok: false, code: mobileAuthCode(error), message: 'La sesion ya no es valida.' });
    }
  };

  changePassword = async (req: MobileAuthRequest, res: Response) => {
    try {
      if (!req.employee) return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED' });
      const currentPassword = String(req.body.current_password || '');
      const newPassword = String(req.body.new_password || '');
      if (newPassword.length < 4 || newPassword.length > 64 || /\s/.test(newPassword)) {
        return res.status(400).json({
          ok: false,
          code: 'INVALID_PASSWORD',
          message: 'La nueva contrasena debe tener entre 4 y 64 caracteres y no contener espacios.',
        });
      }
      const [rows]: any = await pool.query('SELECT password_hash FROM personal_acceso_app WHERE empleado_id = ? LIMIT 1', [req.employee.id]);
      if (!rows.length || !await bcrypt.compare(currentPassword, rows[0].password_hash)) {
        return res.status(401).json({ ok: false, code: 'PASSWORD_INVALID', message: 'La contrasena actual no es correcta.' });
      }
      await pool.query(
        'UPDATE personal_acceso_app SET password_hash = ?, requiere_cambio_clave = 0 WHERE empleado_id = ?',
        [await bcrypt.hash(newPassword, 12), req.employee.id],
      );
      return res.json({ ok: true, message: 'Contrasena actualizada correctamente.' });
    } catch {
      return res.status(500).json({ ok: false, code: 'PASSWORD_CHANGE_ERROR', message: 'No se pudo cambiar la contrasena.' });
    }
  };

  logout = async (req: MobileAuthRequest, res: Response) => {
    if (req.employee) await this.authService.logout(req.employee.sessionId);
    return res.status(204).send();
  };
}
