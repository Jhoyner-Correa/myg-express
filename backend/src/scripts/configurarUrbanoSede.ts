import 'dotenv/config';
import { RowDataPacket } from 'mysql2';

import { pool } from '../core/database/database';
import { encryptUrbanoPassword } from '../services/urbanoCredentialsService';

type SedeRow = RowDataPacket & {
  id: number;
  nombre: string;
};

function getRequiredEnv(name: string): string {
  const value = String(process.env[name] || '').trim();

  if (!value) {
    throw new Error(`Falta configurar ${name}.`);
  }

  return value;
}

async function main() {
  const sedeId = Number(getRequiredEnv('SEDE_ID'));
  const username = getRequiredEnv('URBANO_SEDE_USERNAME');
  const password = getRequiredEnv('URBANO_SEDE_PASSWORD');

  if (!Number.isInteger(sedeId) || sedeId <= 0) {
    throw new Error('SEDE_ID debe ser un numero entero valido.');
  }

  const [sedes] = await pool.query<SedeRow[]>(
    'SELECT id, nombre FROM sedes WHERE id = ? LIMIT 1',
    [sedeId]
  );

  if (!sedes.length) {
    throw new Error(`No existe una sede con id ${sedeId}.`);
  }

  const encrypted = encryptUrbanoPassword(password);

  await pool.query(
    `INSERT INTO urbano_credenciales_sede
       (sede_id, username, password_cipher, password_iv, password_auth_tag, estado)
     VALUES (?, ?, ?, ?, ?, 'activo')
     ON DUPLICATE KEY UPDATE
       username = VALUES(username),
       password_cipher = VALUES(password_cipher),
       password_iv = VALUES(password_iv),
       password_auth_tag = VALUES(password_auth_tag),
       estado = 'activo',
       updated_at = CURRENT_TIMESTAMP`,
    [
      sedeId,
      username,
      encrypted.cipherText,
      encrypted.iv,
      encrypted.authTag
    ]
  );

  console.log(`Credenciales Urbano configuradas para la sede ${sedes[0].nombre} (ID ${sedeId}).`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
