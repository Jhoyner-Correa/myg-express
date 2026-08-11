import bcrypt from 'bcrypt';
import { pool } from '../core/database/database';

function getRequiredEnv(name: string): string {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`Falta configurar ${name}.`);
  }
  return value;
}

async function crearSuperadmin() {
  try {
    const nombre = getRequiredEnv('SYSADMIN_NOMBRE');
    const usuario = getRequiredEnv('SYSADMIN_USUARIO');
    const passwordPlano = getRequiredEnv('SYSADMIN_PASSWORD');

    const hash = await bcrypt.hash(passwordPlano, 10);

    await pool.query(
      `INSERT INTO usuarios (sede_id, nombre, usuario, password_hash, rol, es_superadmin, estado)
       VALUES (NULL, ?, ?, ?, 'SysAdmin', 1, 'activo')`,
      [nombre, usuario, hash]
    );

    console.log('Superadmin creado correctamente');
    console.log('Usuario:', usuario);
    console.log('Password: configurado desde variable de entorno. No se imprime por seguridad.');
    process.exit(0);
  } catch (error: any) {
    console.error('Error al crear superadmin:', error.message || error);
    process.exit(1);
  }
}

crearSuperadmin();
