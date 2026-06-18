import bcrypt from 'bcrypt';
import { pool } from '../config/database';

function getRequiredEnv(name: string): string {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`Falta configurar ${name}.`);
  }
  return value;
}

async function crearUsuario() {
  try {
    const sedeId = Number(getRequiredEnv('USUARIO_SEDE_ID'));
    const nombre = getRequiredEnv('USUARIO_NOMBRE');
    const usuario = getRequiredEnv('USUARIO_LOGIN');
    const passwordPlano = getRequiredEnv('USUARIO_PASSWORD');
    const rol = process.env.USUARIO_ROL || 'EncargadoOficina';

    if (!Number.isInteger(sedeId) || sedeId <= 0) {
      throw new Error('USUARIO_SEDE_ID debe ser un numero entero valido.');
    }

    const hash = await bcrypt.hash(passwordPlano, 10);

    await pool.query(
      `INSERT INTO usuarios (sede_id, nombre, usuario, password_hash, rol, estado)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sedeId, nombre, usuario, hash, rol, 'activo']
    );

    console.log('Usuario creado correctamente');
    process.exit(0);
  } catch (error) {
    console.error('Error al crear usuario:', error);
    process.exit(1);
  }
}

crearUsuario();
