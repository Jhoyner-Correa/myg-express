-- Ejecutar primero. Todos los conteos deben ser 0 antes de aplicar 002.
SELECT 'avisos_lote' AS relacion, COUNT(*) AS huerfanos
FROM avisos_diarios a LEFT JOIN lotes_carga l ON l.id = a.lote_id
WHERE l.id IS NULL
UNION ALL SELECT 'avisos_sede', COUNT(*) FROM avisos_diarios a LEFT JOIN sedes s ON s.id = a.sede_id WHERE s.id IS NULL
UNION ALL SELECT 'avisos_sesion', COUNT(*) FROM avisos_diarios a LEFT JOIN whatsapp_sesiones w ON w.id = a.whatsapp_sesion_id WHERE a.whatsapp_sesion_id IS NOT NULL AND w.id IS NULL
UNION ALL SELECT 'avisos_plantilla', COUNT(*) FROM avisos_diarios a LEFT JOIN plantillas p ON p.id = a.id_plantilla WHERE a.id_plantilla IS NOT NULL AND p.id IS NULL
UNION ALL SELECT 'mensajes_sede', COUNT(*) FROM mensajes_log m LEFT JOIN sedes s ON s.id = m.sede_id WHERE s.id IS NULL
UNION ALL SELECT 'mensajes_lote', COUNT(*) FROM mensajes_log m LEFT JOIN lotes_carga l ON l.id = m.lote_id WHERE m.lote_id IS NOT NULL AND l.id IS NULL
UNION ALL SELECT 'mensajes_aviso', COUNT(*) FROM mensajes_log m LEFT JOIN avisos_diarios a ON a.id = m.aviso_id WHERE m.aviso_id IS NOT NULL AND a.id IS NULL
UNION ALL SELECT 'usuarios_sede', COUNT(*) FROM usuarios u LEFT JOIN sedes s ON s.id = u.sede_id WHERE u.sede_id IS NOT NULL AND s.id IS NULL
UNION ALL SELECT 'sesiones_sede', COUNT(*) FROM whatsapp_sesiones w LEFT JOIN sedes s ON s.id = w.sede_id WHERE s.id IS NULL
UNION ALL SELECT 'plantillas_sede', COUNT(*) FROM plantillas p LEFT JOIN sedes s ON s.id = p.sede_id WHERE p.sede_id IS NOT NULL AND s.id IS NULL
UNION ALL SELECT 'zonas_sede', COUNT(*) FROM zonas z LEFT JOIN sedes s ON s.id = z.sede_id WHERE s.id IS NULL
UNION ALL SELECT 'logs_duplicados_aviso_estado', COUNT(*) FROM (
  SELECT aviso_id, estado_envio FROM mensajes_log
  WHERE aviso_id IS NOT NULL GROUP BY aviso_id, estado_envio HAVING COUNT(*) > 1
) duplicados;

-- Debe devolver 0: una referencia nunca debe cruzar sedes.
SELECT COUNT(*) AS relaciones_entre_sedes
FROM avisos_diarios a
JOIN lotes_carga l ON l.id = a.lote_id
LEFT JOIN whatsapp_sesiones w ON w.id = a.whatsapp_sesion_id
LEFT JOIN plantillas p ON p.id = a.id_plantilla
WHERE a.sede_id <> l.sede_id
   OR (w.id IS NOT NULL AND a.sede_id <> w.sede_id)
   OR (p.id IS NOT NULL AND p.sede_id IS NOT NULL AND a.sede_id <> p.sede_id);
