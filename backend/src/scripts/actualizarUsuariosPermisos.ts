import { pool } from '../core/database/database';
import { RowDataPacket } from 'mysql2';

async function run() {
  try {
    console.log('Validando columna "permisos" en la tabla "usuarios"...');

    // Comprobar si la columna ya existe
    const [columns] = await pool.query<RowDataPacket[]>(
      `SHOW COLUMNS FROM usuarios LIKE 'permisos'`
    );

    if (columns.length === 0) {
      console.log('La columna "permisos" no existe. Creando columna...');
      await pool.query(
        `ALTER TABLE usuarios ADD COLUMN permisos TEXT NULL AFTER estado`
      );
      console.log('Columna "permisos" creada exitosamente.');
    } else {
      console.log('La columna "permisos" ya existe. No se requieren cambios.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error al actualizar la base de datos:', error);
    process.exit(1);
  }
}

run();
