import bcrypt from 'bcrypt';
import { pool } from '../config/database';

async function crearUsuario() {
  try {
    const passwordPlano = '123456';
    const hash = await bcrypt.hash(passwordPlano, 10);

    const [result] = await pool.query(
      `INSERT INTO usuarios (sede_id, nombre, usuario, password_hash, rol, estado)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [1, 'Administrador Satipo', 'satipo_admin', hash, 'admin', 'activo']
    );

    console.log('Usuario creado correctamente');
    process.exit(0);
  } catch (error) {
    console.error('Error al crear usuario:', error);
    process.exit(1);
  }
}

crearUsuario();