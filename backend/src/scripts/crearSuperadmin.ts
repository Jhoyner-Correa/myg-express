import bcrypt from 'bcrypt';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../core/database/database';

function required(name: string): string {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Falta configurar ${name}.`);
  return value;
}

async function main(): Promise<void> {
  const name = required('SYSADMIN_NOMBRE');
  const username = required('SYSADMIN_USUARIO').toLowerCase();
  const passwordHash = await bcrypt.hash(required('SYSADMIN_PASSWORD'), 12);

  await runInTransaction(async connection => {
    const [roles] = await connection.query<RowDataPacket[]>(
      `SELECT id FROM roles
        WHERE codigo = 'SysAdmin' AND tipo_usuario = 'SISTEMA' AND estado = 'ACTIVO'
        LIMIT 1`,
    );
    if (!roles.length) throw new Error('El rol SysAdmin no está configurado.');

    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO usuarios
         (nombre, usuario, password_hash, tipo_usuario, estado, password_actualizado_at)
       VALUES (?, ?, ?, 'SISTEMA', 'activo', NOW())`,
      [name, username, passwordHash],
    );
    await connection.query(
      `INSERT INTO usuario_asignaciones
         (usuario_id, rol_id, empresa_id, sede_id, alcance, es_principal)
       VALUES (?, ?, NULL, NULL, 'SISTEMA', 1)`,
      [result.insertId, roles[0].id],
    );
  });
  console.log('Administrador del sistema creado correctamente.');
}

void main()
  .catch(error => { console.error(error.message || error); process.exitCode = 1; })
  .finally(async () => { await pool.end(); });
