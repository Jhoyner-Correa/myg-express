-- MariaDB 10.4+. Retiro definitivo de tablas RR. HH. reemplazadas.
-- Los datos con valor operativo se copian antes de eliminar las fuentes legadas.

INSERT INTO personal_sobretiempo_solicitudes (
  asistencia_id,
  empleado_id,
  marcacion_id,
  tipo_evento,
  minutos_detectados,
  minutos_aprobados,
  umbral_aplicado_minutos,
  estado,
  revisado_por,
  comentario_revision,
  revisado_en,
  created_at,
  updated_at
)
SELECT legacy.asistencia_id,
       attendance.empleado_id,
       mark.id,
       'SALIDA_POSTERIOR',
       ROUND(legacy.horas_calculadas * 60),
       CASE
         WHEN legacy.estado = 'APROBADA'
           THEN ROUND(COALESCE(legacy.horas_aprobadas, legacy.horas_calculadas) * 60)
         ELSE NULL
       END,
       0,
       CASE legacy.estado
         WHEN 'APROBADA' THEN 'APROBADO'
         WHEN 'RECHAZADA' THEN 'RECHAZADO'
         ELSE 'PENDIENTE'
       END,
       NULL,
       'Migrado desde el registro histórico de horas extra.',
       CASE WHEN legacy.estado IN ('APROBADA', 'RECHAZADA') THEN legacy.updated_at ELSE NULL END,
       legacy.created_at,
       legacy.updated_at
  FROM personal_horas_extras legacy
  JOIN personal_asistencias attendance ON attendance.id = legacy.asistencia_id
  JOIN personal_marcaciones mark
    ON mark.id = (
      SELECT final_mark.id
        FROM personal_marcaciones final_mark
       WHERE final_mark.asistencia_id = legacy.asistencia_id
         AND final_mark.tipo_marcacion = 'SALIDA'
       ORDER BY final_mark.hora_marcacion DESC, final_mark.id DESC
       LIMIT 1
    )
 WHERE NOT EXISTS (
   SELECT 1
     FROM personal_sobretiempo_solicitudes current_request
    WHERE current_request.asistencia_id = legacy.asistencia_id
      AND current_request.tipo_evento = 'SALIDA_POSTERIOR'
 );

INSERT INTO personal_notificaciones_app (
  empleado_id,
  tipo,
  titulo,
  mensaje,
  prioridad,
  accion,
  referencia_tipo,
  referencia_id,
  clave_deduplicacion,
  leida_en,
  expira_en,
  created_at,
  updated_at
)
SELECT legacy.empleado_id,
       legacy.tipo_alerta,
       legacy.titulo,
       legacy.mensaje,
       CASE
         WHEN legacy.tipo_alerta IN ('BATERIA_BAJA', 'ASISTENCIA') THEN 'IMPORTANTE'
         ELSE 'INFO'
       END,
       'INICIO',
       'NOTIFICACION_LEGADA',
       legacy.id,
       CONCAT('legacy-notification-', legacy.id),
       CASE WHEN legacy.leido = 1 THEN legacy.fecha_envio ELSE NULL END,
       NULL,
       legacy.fecha_envio,
       legacy.fecha_envio
  FROM personal_notificaciones legacy
ON DUPLICATE KEY UPDATE
  titulo = VALUES(titulo),
  mensaje = VALUES(mensaje),
  leida_en = COALESCE(personal_notificaciones_app.leida_en, VALUES(leida_en));

DROP TABLE IF EXISTS personal_auditoria_accesos;
DROP TABLE IF EXISTS personal_notificaciones;
DROP TABLE IF EXISTS personal_horas_extras;
DROP TABLE IF EXISTS personal_empleado_horarios;
