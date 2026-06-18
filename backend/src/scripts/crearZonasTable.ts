import { pool } from '../config/database';

async function crearZonasTable() {
  try {
    console.log('Creando tabla de zonas...');
    
    // 1. Crear tabla zonas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`zonas\` (
        \`id\` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
        \`sede_id\` int(10) UNSIGNED NOT NULL,
        \`nombre\` varchar(100) NOT NULL,
        \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(),
        \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_sede_nombre\` (\`sede_id\`, \`nombre\`),
        CONSTRAINT \`fk_zonas_sede\` FOREIGN KEY (\`sede_id\`) REFERENCES \`sedes\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    
    console.log('Tabla de zonas creada o ya existente.');

    // 2. Insertar valores base para todas las sedes registradas
    const [sedesRows]: any = await pool.query('SELECT id, nombre FROM sedes');
    console.log(`Encontradas ${sedesRows.length} sedes. Insertando zonas por defecto...`);

    const defaultZones = ["La Merced", "San Ramón", "Villa Rica"];

    for (const sede of sedesRows) {
      for (const zoneName of defaultZones) {
        try {
          await pool.query(
            'INSERT IGNORE INTO zonas (sede_id, nombre) VALUES (?, ?)',
            [sede.id, zoneName]
          );
        } catch (e) {
          // Ignorar duplicados
        }
      }
      console.log(`Zonas por defecto insertadas para sede: ${sede.nombre}`);
    }

    console.log('Script de inicialización finalizado correctamente.');
    process.exit(0);
  } catch (error) {
    console.error('Error al inicializar tabla de zonas:', error);
    process.exit(1);
  }
}

crearZonasTable();
