-- Retira solicitudes activas que quedaron sin respaldo despues de correcciones antiguas.
INSERT INTO personal_auditoria_eventos
  (tipo_evento, empleado_id, usuario_id, exitoso, codigo_resultado, metadata_json)
SELECT 'SOBRETIEMPO_RECONCILIADO', request.empleado_id, request.revisado_por, 1, 'ANULADO',
       JSON_OBJECT(
         'request_id', request.id,
         'attendance_id', request.asistencia_id,
         'event', request.tipo_evento,
         'previous_status', request.estado,
         'previous_detected_minutes', request.minutos_detectados,
         'previous_approved_minutes', request.minutos_aprobados,
         'corrected_detected_minutes', NULL,
         'source', 'MIGRATION_015'
       )
  FROM personal_sobretiempo_solicitudes request
 WHERE request.estado IN ('PENDIENTE', 'APROBADO')
   AND NOT EXISTS (
     SELECT 1
       FROM personal_marcaciones mark
      WHERE mark.asistencia_id = request.asistencia_id
        AND (
          (request.tipo_evento = 'ALMUERZO_DIFERIDO'
            AND mark.tipo_marcacion = 'SALIDA_ALMUERZO'
            AND COALESCE(mark.diferencia_programada_minutos, 0) >= COALESCE(request.umbral_aplicado_minutos, 1))
          OR
          (request.tipo_evento = 'SALIDA_POSTERIOR'
            AND mark.tipo_marcacion = 'SALIDA'
            AND mark.clasificacion_tiempo = 'SOBRETIEMPO_CANDIDATO'
            AND COALESCE(mark.diferencia_programada_minutos, 0) >= COALESCE(request.umbral_aplicado_minutos, 1))
        )
   );

UPDATE personal_sobretiempo_solicitudes request
   SET request.estado = 'ANULADO',
       request.marcacion_id = NULL,
       request.anulado_por = request.revisado_por,
       request.motivo_anulacion = 'Anulado automaticamente: la marcacion corregida ya no genera horas extra.',
       request.anulado_en = NOW()
 WHERE request.estado IN ('PENDIENTE', 'APROBADO')
   AND NOT EXISTS (
     SELECT 1
       FROM personal_marcaciones mark
      WHERE mark.asistencia_id = request.asistencia_id
        AND (
          (request.tipo_evento = 'ALMUERZO_DIFERIDO'
            AND mark.tipo_marcacion = 'SALIDA_ALMUERZO'
            AND COALESCE(mark.diferencia_programada_minutos, 0) >= COALESCE(request.umbral_aplicado_minutos, 1))
          OR
          (request.tipo_evento = 'SALIDA_POSTERIOR'
            AND mark.tipo_marcacion = 'SALIDA'
            AND mark.clasificacion_tiempo = 'SOBRETIEMPO_CANDIDATO'
            AND COALESCE(mark.diferencia_programada_minutos, 0) >= COALESCE(request.umbral_aplicado_minutos, 1))
        )
   );
