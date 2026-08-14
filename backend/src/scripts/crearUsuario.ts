import bcrypt from 'bcrypt';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../core/database/database';

function required(name: string): string {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Falta configurar ${name}.`);
  return value;
}

async function main(): Promise<void> {
  const siteId = Number(required('USUARIO_SEDE_ID'));
  if (!Number.isInteger(siteId) || siteId <= 0) {
    throw new Error('USUARIO_SEDE_ID debe ser un número entero válido.');
  }
  const name = required('USUARIO_NOMBRE');
  const username = required('USUARIO_LOGIN').toLowerCase();
  const passwordHash = await bcrypt.hash(required('USUARIO_PASSWORD'), 12);
  const roleCode = String(process.env.USUARIO_ROL || 'EncargadoOficina').trim();

  await runInTransaction(async connection => {
    const [accessRows] = await connection.query<RowDataPacket[]>(
      `SELECT role.id AS role_id, role.tipo_alcance, site.empresa_id
         FROM roles role
         INNER JOIN sedes site ON site.id = ? AND site.estado = 'activo'
        WHERE role.codigo = ? AND role.tipo_usuario = 'EMPRESA' AND role.estado = 'ACTIVO'
        LIMIT 1`,
      [siteId, roleCode],
    );
    if (!accessRows.length) throw new Error('La sede o el rol empresarial no son válidos.');

    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO usuarios
         (nombre, usuario, password_hash, tipo_usuario, estado, password_actualizado_at)
       VALUES (?, ?, ?, 'EMPRESA', 'activo', NOW())`,
      [name, username, passwordHash],
    );
    const scope = accessRows[0].tipo_alcance;
    await connection.query(
      `INSERT INTO usuario_asignaciones
         (usuario_id, rol_id, empresa_id, sede_id, alcance, es_principal)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [result.insertId, accessRows[0].role_id, accessRows[0].empresa_id,
        scope === 'SEDE' ? siteId : null, scope],
    );
  });
  console.log('Usuario empresarial creado correctamente.');
}

void main()
  .catch(error => { console.error(error.message || error); process.exitCode = 1; })
  .finally(async () => { await pool.end(); });
