import crypto from 'crypto';
import { RowDataPacket } from 'mysql2';

import { pool } from '../config/database';

export type UrbanoCredentials = {
  source: 'database';
  sedeId: number;
  username: string;
  password: string;
};

type UrbanoCredentialsRow = RowDataPacket & {
  sede_id: number;
  username: string;
  password_cipher: string;
  password_iv: string;
  password_auth_tag: string;
};

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const secret = String(process.env.URBANO_CREDENTIALS_SECRET || '').trim();
  if (!secret) {
    throw new Error('Falta configurar URBANO_CREDENTIALS_SECRET para usar credenciales Urbano por sede.');
  }

  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptUrbanoPassword(password: string) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(password), 'utf8'),
    cipher.final()
  ]);

  return {
    cipherText: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64')
  };
}

function decryptUrbanoPassword(row: UrbanoCredentialsRow): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(row.password_iv, 'base64')
  );

  decipher.setAuthTag(Buffer.from(row.password_auth_tag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(row.password_cipher, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

export async function getUrbanoCredentialsForSede(sedeId: number | null): Promise<UrbanoCredentials> {
  if (!sedeId) {
    throw new Error('Esta operacion requiere una sede con credenciales Urbano configuradas.');
  }

  try {
    const [rows] = await pool.query<UrbanoCredentialsRow[]>(
      `SELECT sede_id, username, password_cipher, password_iv, password_auth_tag
       FROM urbano_credenciales_sede
       WHERE sede_id = ?
         AND estado = 'activo'
       LIMIT 1`,
      [sedeId]
    );

    if (rows.length) {
      return {
        source: 'database',
        sedeId,
        username: rows[0].username,
        password: decryptUrbanoPassword(rows[0])
      };
    }
  } catch (error: any) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      throw new Error('Falta ejecutar la migracion urbano_credenciales_sede antes de usar Urbano por sede.');
    }

    throw error;
  }

  throw new Error('Esta sede no tiene credenciales Urbano activas. Configuralas desde el panel SysAdmin.');
}

export async function touchUrbanoCredentialLogin(sedeId: number | null) {
  if (!sedeId) return;

  await pool.query(
    `UPDATE urbano_credenciales_sede
     SET last_login_at = NOW()
     WHERE sede_id = ?
       AND estado = 'activo'`,
    [sedeId]
  );
}
