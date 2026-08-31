# RR. HH. móvil: contrato de seguridad inicial

Esta fase implementa la identidad técnica y las reglas de asistencia que utilizará Flutter. El servidor es la única autoridad para decidir si una marcación es válida.

## Flujo de alta

1. Un administrador crea el empleado y solicita `POST /api/rrhh/empleados/:id/activacion-dispositivo`.
2. La API entrega una contraseña temporal y un código de ocho dígitos que expira en 15 minutos. Solo se muestran una vez; la base almacena sus hashes.
3. Flutter crea dentro del almacén seguro del sistema una clave ECDSA P-256 no exportable.
4. Flutter llama `POST /api/mobile/rrhh/auth/activate` con el código, la contraseña temporal, el identificador de instalación y la clave pública.
5. Solo puede existir un dispositivo `AUTORIZADO` por empleado. El administrador debe revocarlo antes de autorizar un reemplazo.
6. La app guarda el `refresh_token` en Android Keystore/iOS Keychain. La sesión dura 30 días y rota el refresh token en cada uso.
7. El empleado cambia la contraseña temporal una sola vez mediante `POST /api/mobile/rrhh/auth/change-password`.

## Flujo de marcación

1. La app consulta `GET /api/mobile/rrhh/attendance/today` para obtener empleado, horario, marcaciones y transiciones permitidas.
2. La app solicita `POST /api/mobile/rrhh/attendance/challenge` con el tipo de marcación.
3. El servidor devuelve un `challenge_id` y un `nonce` válidos durante 90 segundos.
4. Flutter pide la biometría local. Cuando Android la valida, la clave privada firma el payload canónico `myg-rrhh-clock-v1`.
5. La app envía la firma, GPS, precisión, hora ISO y un `request_id` UUID a `POST /api/mobile/rrhh/attendance/clock`.
6. El backend deriva empleado y dispositivo del token; nunca acepta un `empleado_id` declarado por Flutter.
7. Se verifican firma, desafío de un solo uso, reloj, precisión GPS, geocerca, secuencia e idempotencia.

Secuencia válida: `ENTRADA` → `SALIDA_ALMUERZO` → `REGRESO` → `SALIDA`. También se permite `ENTRADA` → `SALIDA` para jornadas sin almuerzo.

## Evidencias

`personal_evidencias_marcacion` solo guarda la clave privada de almacenamiento, SHA-256, MIME, tamaño y caducidad. No guarda imágenes BLOB ni publica una URL. La política inicial será foto en entrada y eventos de riesgo, retención de 90 días y eliminación automatizada; la carga binaria se implementará cuando se conecte Flutter y el almacenamiento privado elegido.

## Operación

- Preparación del esquema: `npm run db:migrate` dentro de `backend`.
- Auditoría posterior: `npm run db:verify:rrhh-schema`.
- Revocar teléfono: `POST /api/rrhh/empleados/:id/revocar-dispositivo` con `{ "motivo": "..." }`.
