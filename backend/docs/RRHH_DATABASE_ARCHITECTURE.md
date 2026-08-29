# Arquitectura canónica de la base de datos de RR. HH.

## Objetivo

La base de datos se consolida de forma incremental. Las tablas históricas no se borran mientras exista información que deba conservarse, pero dejan de ser la fuente de verdad de la aplicación.

## Núcleos del modelo

| Área | Fuente de verdad |
|---|---|
| Empresa y sedes | `empresas`, `sedes` |
| Acceso al sistema web | `usuarios`, `roles`, `permisos`, `usuario_asignaciones` |
| Colaboradores | `personal_empleados`, `personal_empleado_sedes`, `personal_cargos` |
| Horarios | `personal_horarios`, `personal_horario_versiones`, `personal_horario_asignaciones` |
| Calendario laboral | `personal_calendario_laboral`, `personal_calendario_propuestas` |
| Asistencia | `personal_asistencias`, `personal_marcaciones` |
| Correcciones e incidencias | `personal_correcciones_asistencia`, `personal_incidencias_asistencia_revisiones` |
| Sobretiempo | `personal_sobretiempo_solicitudes` |
| Aplicación móvil | `personal_dispositivos`, `personal_sesiones_app`, `personal_activaciones_dispositivo` |
| Notificaciones móviles | `personal_notificaciones_app` |
| Auditoría | `personal_auditoria_eventos`, `auditoria_sistema` |

## Reglas de integridad

- Un colaborador activo tiene exactamente una sede laboral vigente.
- Un traslado cierra la asignación anterior y abre una nueva; no reemplaza el historial.
- La columna `personal_empleados.sede_id` se conserva como proyección de la sede actual para mantener compatibilidad con los módulos existentes.
- Un traslado entre empresas se rechaza. Ese caso requiere un proceso empresarial explícito, no una edición común.
- Las contraseñas y tokens nunca se almacenan ni se exponen en texto plano.
- Las migraciones ejecutadas se registran en `schema_migrations`.
- Las correcciones, cancelaciones y decisiones administrativas conservan actor, fecha y motivo.

## Tablas heredadas retiradas

La migración `033_rrhh_legacy_retirement` conserva los datos operativos necesarios en las fuentes canónicas y elimina definitivamente `personal_empleado_horarios`, `personal_horas_extras`, `personal_notificaciones` y `personal_auditoria_accesos`. Desde ese punto, el auditor exige que esas tablas permanezcan ausentes.

## Despliegue

1. Crear un respaldo completo de MariaDB.
2. Ejecutar `npm run db:migrate` dentro de `backend`.
3. Ejecutar `npm run db:verify:rrhh-schema`.
4. Desplegar el backend solo si el auditor termina sin errores.

No se deben aplicar fragmentos manuales desde phpMyAdmin. El mismo proceso debe ejecutarse en desarrollo, pruebas y producción para conservar una historia reproducible.

## Próxima fase controlada

El modelo ya reconoce empresas en identidad y sedes. La siguiente evolución, cuando exista una segunda empresa real, será incorporar `empresa_id` explícito en catálogos corporativos como cargos, horarios y calendario. No se fuerza ahora porque requiere una migración de datos y reglas de alcance en todos los servicios consumidores.
