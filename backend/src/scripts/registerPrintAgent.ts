import 'dotenv/config';
import crypto from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { pool } from '../core/database/database';

function required(name: string, maximum: number): string {
  const value = String(process.env[name] ?? '').trim();
  if (!value) throw new Error(`Falta configurar ${name}.`);
  if (value.length > maximum) throw new Error(`${name} admite hasta ${maximum} caracteres.`);
  return value;
}

async function main() {
  const siteId = Number(required('PRINT_AGENT_SITE_ID', 10));
  const name = required('PRINT_AGENT_NAME', 80);
  const printerName = required('PRINT_AGENT_PRINTER', 180);
  const suppliedToken = String(process.env.PRINT_AGENT_TOKEN ?? '').trim();
  const token = suppliedToken || crypto.randomBytes(32).toString('base64url');

  if (!Number.isInteger(siteId) || siteId <= 0) throw new Error('PRINT_AGENT_SITE_ID no es valido.');
  if (Buffer.byteLength(token, 'utf8') < 32) throw new Error('PRINT_AGENT_TOKEN debe tener al menos 32 caracteres.');

  const [sites] = await pool.query<RowDataPacket[]>('SELECT nombre FROM sedes WHERE id = ? LIMIT 1', [siteId]);
  if (!sites.length) throw new Error(`No existe la sede ${siteId}.`);

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO impresion_agentes (sede_id, nombre, token_hash, impresora_nombre, estado)
     VALUES (?, ?, ?, ?, 'ACTIVO')
     ON DUPLICATE KEY UPDATE
       token_hash = VALUES(token_hash), impresora_nombre = VALUES(impresora_nombre),
       estado = 'ACTIVO', ultimo_contacto_at = NULL`,
    [siteId, name, tokenHash, printerName],
  );

  console.log(`Agente configurado para ${sites[0].nombre} (registro ${result.insertId || 'actualizado'}).`);
  console.log(`PRINT_AGENT_TOKEN=${token}`);
  console.log('Guarda este token en el equipo de impresion; no puede recuperarse desde la base de datos.');
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());
