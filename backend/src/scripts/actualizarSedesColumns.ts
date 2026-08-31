import { pool } from '../core/database/database';

async function actualizarSedes() {
  try {
    console.log('Verificando y agregando columnas a la tabla sedes...');
    
    // Check if columns exist
    const [columns]: any = await pool.query('DESCRIBE sedes');
    const columnNames = columns.map((c: any) => c.Field);
    
    if (!columnNames.includes('latitud')) {
      console.log('Agregando columna latitud...');
      await pool.query('ALTER TABLE sedes ADD COLUMN latitud DECIMAL(10, 8) NULL DEFAULT NULL');
    }
    if (!columnNames.includes('longitud')) {
      console.log('Agregando columna longitud...');
      await pool.query('ALTER TABLE sedes ADD COLUMN longitud DECIMAL(11, 8) NULL DEFAULT NULL');
    }
    if (!columnNames.includes('radio_permitido_metros')) {
      console.log('Agregando columna radio_permitido_metros...');
      await pool.query('ALTER TABLE sedes ADD COLUMN radio_permitido_metros INT UNSIGNED NULL DEFAULT NULL');
    }
    
    console.log('Columnas de sedes actualizadas correctamente.');
    process.exit(0);
  } catch (error) {
    console.error('Error al actualizar columnas en la tabla sedes:', error);
    process.exit(1);
  }
}

actualizarSedes();
