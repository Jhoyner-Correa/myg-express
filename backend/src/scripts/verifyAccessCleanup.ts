import { RowDataPacket } from 'mysql2/promise';
import { loadAccessContext } from '../core/auth/accessControl';
import { pool } from '../core/database/database';
import { UserAccessAdminService } from '../modules/administrativo/services/UserAccessAdminService';
import { MySqlUsuarioRepository } from '../modules/auth/repositories/mysql/MySqlUsuarioRepository';

const EXPECTED_COLUMNS = [
  'id',
  'nombre',
  'usuario',
  'password_hash',
  'tipo_usuario',
  'estado',
  'ultimo_acceso_at',
  'password_actualizado_at',
  'created_at',
  'updated_at',
];

async function main(): Promise<void> {
  const [columnRows] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios'
      ORDER BY ORDINAL_POSITION`,
  );
  const columns = columnRows.map(row => String(row.column_name));
  if (JSON.stringify(columns) !== JSON.stringify(EXPECTED_COLUMNS)) {
    throw new Error(`Estructura inesperada en usuarios: ${columns.join(', ')}`);
  }

  const [users] = await pool.query<RowDataPacket[]>(
    'SELECT id, usuario, tipo_usuario FROM usuarios ORDER BY id',
  );
  const repository = new MySqlUsuarioRepository();
  for (const user of users) {
    const identity = await repository.buscarPorId(Number(user.id));
    if (!identity || identity.usuario !== user.usuario) {
      throw new Error(`No se pudo resolver la identidad de ${user.usuario}.`);
    }
    const access = await loadAccessContext(Number(user.id));
    if (access.type !== user.tipo_usuario) {
      throw new Error(`Tipo de acceso inconsistente para ${user.usuario}.`);
    }
    console.log(`OK ${user.usuario}: ${access.role} / ${access.scope} / ${access.permissions.length} permisos`);
  }
  const managedUsers = await new UserAccessAdminService().listUsers();
  if (managedUsers.length !== users.length) {
    throw new Error('El panel administrativo no puede resolver todas las cuentas.');
  }
  console.log(`OK usuarios: ${columns.join(', ')}`);
}

void main()
  .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(async () => pool.end());
