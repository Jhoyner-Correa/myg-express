import { pool } from '../core/database/database';

const foreignKeys = [
  ['fk_avisos_lote', `ALTER TABLE avisos_diarios ADD CONSTRAINT fk_avisos_lote FOREIGN KEY (lote_id) REFERENCES lotes_carga(id) ON DELETE RESTRICT ON UPDATE CASCADE`],
  ['fk_avisos_sede', `ALTER TABLE avisos_diarios ADD CONSTRAINT fk_avisos_sede FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE RESTRICT ON UPDATE CASCADE`],
  ['fk_avisos_sesion', `ALTER TABLE avisos_diarios ADD CONSTRAINT fk_avisos_sesion FOREIGN KEY (whatsapp_sesion_id) REFERENCES whatsapp_sesiones(id) ON DELETE SET NULL ON UPDATE CASCADE`],
  ['fk_avisos_plantilla', `ALTER TABLE avisos_diarios ADD CONSTRAINT fk_avisos_plantilla FOREIGN KEY (id_plantilla) REFERENCES plantillas(id) ON DELETE SET NULL ON UPDATE CASCADE`],
  ['fk_avisos_marcado_usuario', `ALTER TABLE avisos_diarios ADD CONSTRAINT fk_avisos_marcado_usuario FOREIGN KEY (marcado_manual_por) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE`],
  ['fk_avisos_entregado_usuario', `ALTER TABLE avisos_diarios ADD CONSTRAINT fk_avisos_entregado_usuario FOREIGN KEY (entregado_por) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE`],
  ['fk_log_sede', `ALTER TABLE mensajes_log ADD CONSTRAINT fk_log_sede FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE RESTRICT ON UPDATE CASCADE`],
  ['fk_log_lote', `ALTER TABLE mensajes_log ADD CONSTRAINT fk_log_lote FOREIGN KEY (lote_id) REFERENCES lotes_carga(id) ON DELETE SET NULL ON UPDATE CASCADE`],
  ['fk_log_aviso', `ALTER TABLE mensajes_log ADD CONSTRAINT fk_log_aviso FOREIGN KEY (aviso_id) REFERENCES avisos_diarios(id) ON DELETE SET NULL ON UPDATE CASCADE`],
  ['fk_log_sesion', `ALTER TABLE mensajes_log ADD CONSTRAINT fk_log_sesion FOREIGN KEY (whatsapp_sesion_id) REFERENCES whatsapp_sesiones(id) ON DELETE SET NULL ON UPDATE CASCADE`],
  ['fk_sesiones_sede', `ALTER TABLE whatsapp_sesiones ADD CONSTRAINT fk_sesiones_sede FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE RESTRICT ON UPDATE CASCADE`],
  ['fk_plantillas_sede', `ALTER TABLE plantillas ADD CONSTRAINT fk_plantillas_sede FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE RESTRICT ON UPDATE CASCADE`],
  ['fk_zonas_sede', `ALTER TABLE zonas ADD CONSTRAINT fk_zonas_sede FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE CASCADE ON UPDATE CASCADE`],
  ['fk_sede_config_sede', `ALTER TABLE sede_configuracion ADD CONSTRAINT fk_sede_config_sede FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE CASCADE ON UPDATE CASCADE`],
  ['fk_sede_config_plantilla', `ALTER TABLE sede_configuracion ADD CONSTRAINT fk_sede_config_plantilla FOREIGN KEY (plantilla_whatsapp_default_id) REFERENCES plantillas(id) ON DELETE SET NULL ON UPDATE CASCADE`],
  ['fk_urbano_cred_sede', `ALTER TABLE urbano_credenciales_sede ADD CONSTRAINT fk_urbano_cred_sede FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE CASCADE ON UPDATE CASCADE`],
  ['fk_urbano_cache_usuario', `ALTER TABLE urbano_route_cache ADD CONSTRAINT fk_urbano_cache_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE`],
  ['fk_urbano_cache_sede', `ALTER TABLE urbano_route_cache ADD CONSTRAINT fk_urbano_cache_sede FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE CASCADE ON UPDATE CASCADE`]
] as const;

const indexes = [
  ['idx_avisos_sede_lote_estado', `CREATE INDEX idx_avisos_sede_lote_estado ON avisos_diarios (sede_id,lote_id,estado_aviso)`],
  ['idx_avisos_sede_estado_created', `CREATE INDEX idx_avisos_sede_estado_created ON avisos_diarios (sede_id,estado_aviso,created_at)`],
  ['uq_avisos_job_id', `CREATE UNIQUE INDEX uq_avisos_job_id ON avisos_diarios (id_trabajo_cola)`],
  ['idx_log_sesion_estado_fecha', `CREATE INDEX idx_log_sesion_estado_fecha ON mensajes_log (whatsapp_sesion_id,estado_envio,created_at)`],
  ['idx_log_sede_fecha', `CREATE INDEX idx_log_sede_fecha ON mensajes_log (sede_id,created_at)`],
  ['uq_log_aviso_estado', `CREATE UNIQUE INDEX uq_log_aviso_estado ON mensajes_log (aviso_id,estado_envio)`],
  ['idx_lotes_sede_activos_fecha', `CREATE INDEX idx_lotes_sede_activos_fecha ON lotes_carga (sede_id,fecha_eliminacion,fecha)`],
  ['idx_sesiones_sede_activo_estado', `CREATE INDEX idx_sesiones_sede_activo_estado ON whatsapp_sesiones (sede_id,activo,estado)`],
  ['idx_plantillas_sede_estado', `CREATE INDEX idx_plantillas_sede_estado ON plantillas (sede_id,estado)`],
  ['idx_marcaciones_asistencia_hora', `CREATE INDEX idx_marcaciones_asistencia_hora ON personal_marcaciones (asistencia_id,hora_marcacion)`]
] as const;

async function main() {
  const [[lock]]: any = await pool.query(`SELECT GET_LOCK('myg_integrity_migration', 10) acquired`);
  if (Number(lock?.acquired) !== 1) throw new Error('No se pudo adquirir el candado de migracion.');

  try {
    for (const [name, ddl] of foreignKeys) {
      const [[exists]]: any = await pool.query(
        `SELECT COUNT(*) total FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME=?`,
        [name]
      );
      if (!Number(exists.total)) await pool.query(ddl);
      console.log(`OK foreign-key ${name}`);
    }
    for (const [name, ddl] of indexes) {
      const [[exists]]: any = await pool.query(
        `SELECT COUNT(*) total FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND INDEX_NAME=?`,
        [name]
      );
      if (!Number(exists.total)) await pool.query(ddl);
      console.log(`OK index ${name}`);
    }
  } finally {
    await pool.query(`SELECT RELEASE_LOCK('myg_integrity_migration')`);
  }
  console.log('Migracion de integridad aplicada correctamente.');
}

void main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
}).finally(async () => pool.end());
