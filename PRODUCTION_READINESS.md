# Salida controlada a produccion

Este documento es una puerta de control. MyG Express no se considera listo solo porque compile: debe completar seguridad, datos, operacion y aplicacion movil.

## 1. Preparar una copia de produccion

1. Congelar cambios funcionales y crear una etiqueta de version.
2. Ejecutar `npm ci`, `npm audit --omit=dev --audit-level=high`, pruebas y compilacion en backend y frontend.
3. Ejecutar `npm run db:preflight`, `npm run db:verify:rrhh-schema` y `npm run db:verify:access-model` contra una copia restaurada de la base real.
4. Construir la imagen desde el commit etiquetado. No copiar `node_modules`, fuentes Flutter ni secretos al VPS.

## 2. Secretos y red

- Usar un usuario MariaDB exclusivo, sin acceso remoto publico ni privilegios globales.
- Generar valores diferentes de al menos 32 bytes para `JWT_SECRET`, `PAYMENTS_DATA_ENCRYPTION_KEY` y `URBANO_CREDENTIALS_SECRET`.
- Configurar `APP_TRUST_PROXY_HOPS=1` cuando exista un unico Nginx delante de Node.
- Configurar `APP_CORS_ORIGINS` con el dominio HTTPS exacto; nunca `*`, localhost ni direcciones HTTP.
- Mantener Redis, MariaDB, Evolution y el worker en red privada. Solo Nginx publica 80/443; la API queda enlazada a `127.0.0.1:3000`.
- Rotar cualquier token compartido durante desarrollo antes de publicar.

La API y el worker validan estas condiciones al arrancar y se detienen ante una configuracion de produccion insegura.

## 3. Migraciones y respaldo

1. Crear un respaldo consistente con `ops/backup-mariadb.sh`, incluyendo `backend/storage` y `backend/private-storage`.
2. Verificar checksum y ejecutar `ops/restore-drill-mariadb.sh` contra una base temporal terminada en `_restore_drill`.
3. Aplicar `npm run db:migrate` una sola vez desde un proceso de mantenimiento.
4. Repetir los tres verificadores antes de habilitar trafico.
5. Conservar el respaldo previo fuera del mismo VPS.

No se debe migrar si el respaldo no puede restaurarse. Las evidencias privadas, selfies pendientes y sustentos no deben servirse mediante Nginx como archivos estaticos.

## 4. Procesos y observabilidad

- Ejecutar API y worker como servicios separados con reinicio automatico.
- Mantener exactamente un worker operativo mediante el candado de base de datos.
- Supervisar `/api/health`; devuelve `503` si MariaDB o Redis no estan disponibles.
- Enviar logs a rotacion centralizada y alertar por reinicios, errores 5xx, cola detenida, disco mayor a 80% y respaldos fallidos.
- Probar un apagado controlado: API y worker deben cerrar HTTP, colas, Redis y MariaDB sin aceptar trabajo nuevo.
- Definir una ventana mensual para probar restauracion y actualizar dependencias.

## 5. Aplicacion Android

- Crear y custodiar una clave empresarial de firma. No usar la clave debug ni guardar `key.properties` en Git.
- Construir el AAB mediante el flujo de release con `APP_ENV=production` y una URL API HTTPS.
- Verificar la firma del AAB antes de distribuirlo.
- Probar en al menos dos versiones Android: activacion, biometria, marcaciones, contingencia con selfie, solicitudes, GPS en segundo plano, reinicio del equipo y red intermitente.
- Publicar primero a un grupo piloto y conservar una version anterior instalable para contingencia.

El token del servicio GPS se cifra con Android Keystore; el servicio puede reanudarse tras reiniciar el celular y siempre muestra una notificacion mientras la jornada permanece activa.

## 6. Criterio de aprobacion

La salida queda aprobada unicamente cuando:

- CI y auditorias no tienen errores ni vulnerabilidades altas.
- La base restaurada pasa preflight, migraciones y verificadores.
- HTTPS, firewall, secretos y respaldos se verificaron desde el VPS.
- El AAB esta firmado y el piloto movil completo no presenta bloqueos.
- Existe un responsable de rollback y una ventana de monitoreo posterior al despliegue.

Hasta completar las pruebas de VPS, restauracion y firma empresarial, el sistema puede estar tecnicamente endurecido pero no debe declararse aun en produccion.
