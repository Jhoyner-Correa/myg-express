import bcrypt from 'bcrypt';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/database';

async function crearSuperadmin() {
  try {
    const nombreSede = 'Central';
    const nombre = 'Administrador Central';
    const usuario = 'admin_master';
    const passwordPlano = '123456';

    const [[sede]] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM sedes WHERE nombre = ? LIMIT 1',
      [nombreSede]
    );

    let sedeId = sede?.id;

    if (!sedeId) {
      const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO sedes (nombre, direccion, telefono, estado)
         VALUES (?, ?, ?, 'activo')`,
        [nombreSede, 'Oficina central', null]
      );
      sedeId = result.insertId;
    }

    const hash = await bcrypt.hash(passwordPlano, 10);

    await pool.query(
      `INSERT INTO usuarios (sede_id, nombre, usuario, password_hash, rol, estado)
       VALUES (?, ?, ?, ?, 'admin', 'activo')`,
      [sedeId, nombre, usuario, hash]
    );

    console.log('Superadmin creado correctamente');
    console.log('Usuario:', usuario);
    console.log('Password:', passwordPlano);
    console.log('Agrega SUPERADMIN_USERS=admin_master en tu archivo .env');
    process.exit(0);
  } catch (error: any) {
    console.error('Error al crear superadmin:', error.message || error);
    process.exit(1);
  }
}

crearSuperadmin();
