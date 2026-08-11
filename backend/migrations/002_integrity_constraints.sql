-- MariaDB 10.4+. Aplicar solo cuando 001 devuelva todos los conteos en cero.
-- La rutina vuelve esta migracion idempotente por nombre de constraint.
DELIMITER $$
DROP PROCEDURE IF EXISTS add_fk_if_missing$$
CREATE PROCEDURE add_fk_if_missing(IN fk_name VARCHAR(64), IN ddl_text TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = fk_name
  ) THEN
    SET @ddl = ddl_text;
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL add_fk_if_missing('fk_avisos_lote', 'ALTER TABLE avisos_diarios ADD CONSTRAINT fk_avisos_lote FOREIGN KEY (lote_id) REFERENCES lotes_carga(id) ON DELETE RESTRICT ON UPDATE CASCADE');
CALL add_fk_if_missing('fk_avisos_sede', 'ALTER TABLE avisos_diarios ADD CONSTRAINT fk_avisos_sede FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE RESTRICT ON UPDATE CASCADE');
CALL add_fk_if_missing('fk_avisos_sesion', 'ALTER TABLE avisos_diarios ADD CONSTRAINT fk_avisos_sesion FOREIGN KEY (whatsapp_sesion_id) REFERENCES whatsapp_sesiones(id) ON DELETE SET NULL ON UPDATE CASCADE');
CALL add_fk_if_missing('fk_avisos_plantilla', 'ALTER TABLE avisos_diarios ADD CONSTRAINT fk_avisos_plantilla FOREIGN KEY (id_plantilla) REFERENCES plantillas(id) ON DELETE SET NULL ON UPDATE CASCADE');
CALL add_fk_if_missing('fk_avisos_marcado_usuario', 'ALTER TABLE avisos_diarios ADD CONSTRAINT fk_avisos_marcado_usuario FOREIGN KEY (marcado_manual_por) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE');
CALL add_fk_if_missing('fk_avisos_entregado_usuario', 'ALTER TABLE avisos_diarios ADD CONSTRAINT fk_avisos_entregado_usuario FOREIGN KEY (entregado_por) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE');

CALL add_fk_if_missing('fk_log_sede', 'ALTER TABLE mensajes_log ADD CONSTRAINT fk_log_sede FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE RESTRICT ON UPDATE CASCADE');
CALL add_fk_if_missing('fk_log_lote', 'ALTER TABLE mensajes_log ADD CONSTRAINT fk_log_lote FOREIGN KEY (lote_id) REFERENCES lotes_carga(id) ON DELETE SET NULL ON UPDATE CASCADE');
CALL add_fk_if_missing('fk_log_aviso', 'ALTER TABLE mensajes_log ADD CONSTRAINT fk_log_aviso FOREIGN KEY (aviso_id) REFERENCES avisos_diarios(id) ON DELETE SET NULL ON UPDATE CASCADE');
CALL add_fk_if_missing('fk_log_sesion', 'ALTER TABLE mensajes_log ADD CONSTRAINT fk_log_sesion FOREIGN KEY (whatsapp_sesion_id) REFERENCES whatsapp_sesiones(id) ON DELETE SET NULL ON UPDATE CASCADE');

CALL add_fk_if_missing('fk_usuarios_sede', 'ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_sede FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE RESTRICT ON UPDATE CASCADE');
CALL add_fk_if_missing('fk_sesiones_sede', 'ALTER TABLE whatsapp_sesiones ADD CONSTRAINT fk_sesiones_sede FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE RESTRICT ON UPDATE CASCADE');
CALL add_fk_if_missing('fk_plantillas_sede', 'ALTER TABLE plantillas ADD CONSTRAINT fk_plantillas_sede FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE RESTRICT ON UPDATE CASCADE');
CALL add_fk_if_missing('fk_zonas_sede', 'ALTER TABLE zonas ADD CONSTRAINT fk_zonas_sede FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE CASCADE ON UPDATE CASCADE');
CALL add_fk_if_missing('fk_sede_config_sede', 'ALTER TABLE sede_configuracion ADD CONSTRAINT fk_sede_config_sede FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE CASCADE ON UPDATE CASCADE');
CALL add_fk_if_missing('fk_sede_config_plantilla', 'ALTER TABLE sede_configuracion ADD CONSTRAINT fk_sede_config_plantilla FOREIGN KEY (plantilla_whatsapp_default_id) REFERENCES plantillas(id) ON DELETE SET NULL ON UPDATE CASCADE');
CALL add_fk_if_missing('fk_urbano_cred_sede', 'ALTER TABLE urbano_credenciales_sede ADD CONSTRAINT fk_urbano_cred_sede FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE CASCADE ON UPDATE CASCADE');
CALL add_fk_if_missing('fk_urbano_cache_usuario', 'ALTER TABLE urbano_route_cache ADD CONSTRAINT fk_urbano_cache_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE');
CALL add_fk_if_missing('fk_urbano_cache_sede', 'ALTER TABLE urbano_route_cache ADD CONSTRAINT fk_urbano_cache_sede FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE CASCADE ON UPDATE CASCADE');

DROP PROCEDURE add_fk_if_missing;

CREATE INDEX IF NOT EXISTS idx_avisos_sede_lote_estado ON avisos_diarios (sede_id, lote_id, estado_aviso);
CREATE INDEX IF NOT EXISTS idx_avisos_sede_estado_created ON avisos_diarios (sede_id, estado_aviso, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_avisos_job_id ON avisos_diarios (id_trabajo_cola);
CREATE INDEX IF NOT EXISTS idx_log_sesion_estado_fecha ON mensajes_log (whatsapp_sesion_id, estado_envio, created_at);
CREATE INDEX IF NOT EXISTS idx_log_sede_fecha ON mensajes_log (sede_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_log_aviso_estado ON mensajes_log (aviso_id, estado_envio);
CREATE INDEX IF NOT EXISTS idx_lotes_sede_activos_fecha ON lotes_carga (sede_id, fecha_eliminacion, fecha);
CREATE INDEX IF NOT EXISTS idx_sesiones_sede_activo_estado ON whatsapp_sesiones (sede_id, activo, estado);
CREATE INDEX IF NOT EXISTS idx_plantillas_sede_estado ON plantillas (sede_id, estado);
CREATE INDEX IF NOT EXISTS idx_marcaciones_asistencia_hora ON personal_marcaciones (asistencia_id, hora_marcacion);
