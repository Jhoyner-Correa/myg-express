import { pool } from '../config/database';

async function crearPaquetesTables() {
  try {
    console.log('Iniciando creación de tablas para módulo SAVAR SCAN...');

    // 1. Crear tabla de paquetes (Hoja maestra de paquetes)
    console.log('Creando tabla `paquetes`...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`paquetes\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`codigo_paquete\` VARCHAR(100) NOT NULL,
        \`consignado\` VARCHAR(255) NOT NULL,
        \`direccion\` VARCHAR(255) NOT NULL,
        \`telefono\` VARCHAR(50) DEFAULT NULL,
        \`departamento\` VARCHAR(100) NOT NULL,
        \`provincia\` VARCHAR(100) NOT NULL,
        \`distrito\` VARCHAR(100) NOT NULL,
        \`lote_importacion\` VARCHAR(120) NOT NULL DEFAULT 'SAVAR-GENERAL',
        \`estado\` VARCHAR(50) NOT NULL DEFAULT 'PENDIENTE',
        \`fecha_escaneo\` DATETIME DEFAULT NULL,
        \`usuario_id_escaneo\` INT(10) UNSIGNED DEFAULT NULL,
        \`sede_id_escaneo\` INT(10) UNSIGNED DEFAULT NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP() ON UPDATE CURRENT_TIMESTAMP(),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_codigo_paquete\` (\`codigo_paquete\`),
        KEY \`idx_paquetes_estado\` (\`estado\`),
        KEY \`idx_paquetes_lote\` (\`lote_importacion\`, \`estado\`),
        KEY \`idx_paquetes_escaneo\` (\`sede_id_escaneo\`, \`fecha_escaneo\`),
        CONSTRAINT \`fk_paquetes_usuario\` FOREIGN KEY (\`usuario_id_escaneo\`) REFERENCES \`usuarios\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`fk_paquetes_sede_escaneo\` FOREIGN KEY (\`sede_id_escaneo\`) REFERENCES \`sedes\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('Tabla `paquetes` creada o ya existente.');

    // 2. Crear tabla de auditoría para incidencias y duplicados
    console.log('Creando tabla `paquetes_auditoria`...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`paquetes_auditoria\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`codigo_escaneado\` VARCHAR(100) NOT NULL,
        \`tipo_incidencia\` VARCHAR(50) NOT NULL,
        \`usuario_id\` INT(10) UNSIGNED NOT NULL,
        \`sede_id\` INT(10) UNSIGNED NOT NULL,
        \`fecha\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
        PRIMARY KEY (\`id\`),
        KEY \`idx_paquetes_aud_tipo\` (\`tipo_incidencia\`),
        KEY \`idx_paquetes_aud_sede_fecha\` (\`sede_id\`, \`fecha\`),
        CONSTRAINT \`fk_paquetes_aud_usuario\` FOREIGN KEY (\`usuario_id\`) REFERENCES \`usuarios\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_paquetes_aud_sede\` FOREIGN KEY (\`sede_id\`) REFERENCES \`sedes\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('Tabla `paquetes_auditoria` creada o ya existente.');

    console.log('Tablas de SAVAR SCAN creadas exitosamente.');
    process.exit(0);
  } catch (error) {
    console.error('Error al inicializar las tablas de SAVAR SCAN:', error);
    process.exit(1);
  }
}

crearPaquetesTables();
