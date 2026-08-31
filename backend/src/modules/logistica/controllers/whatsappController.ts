import { Response } from 'express';
import { RowDataPacket } from 'mysql2';
import { pool } from '../../../core/database/database';
import whatsappService from '../../../services/whatsapp/whatsappService';
import { AuthRequest } from '../../../core/middlewares/authMiddleware';

type SessionRow = RowDataPacket & {
  id: number;
  session_key: string;
  sede_id: number;
};

export const sendWhatsAppMessage = async (req: AuthRequest, res: Response) => {
  try {
    const sedeId = req.user?.sede_id;
    const { sessionKey, to, message } = req.body;

    if (!sedeId) {
      return res.status(401).json({
        ok: false,
        message: 'Sesion no valida'
      });
    }

    if (!sessionKey || !to || !message) {
      return res.status(400).json({
        ok: false,
        message: 'sessionKey, to y message son obligatorios'
      });
    }

    const [rows] = await pool.query<SessionRow[]>(
      `SELECT id, session_key, sede_id
       FROM whatsapp_sesiones
       WHERE session_key = ? AND sede_id = ?
       LIMIT 1`,
      [sessionKey, sedeId]
    );

    if (!rows.length) {
      return res.status(403).json({
        ok: false,
        message: 'La sesion no pertenece a tu sede'
      });
    }

    const result = await whatsappService.sendMessage(sessionKey, to, message);

    return res.json({
      ok: true,
      message: 'Mensaje enviado correctamente',
      result
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al enviar mensaje',
      error: error.message
    });
  }
};
