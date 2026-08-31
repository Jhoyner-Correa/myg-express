# Versionado de Asistencia - MyG

La aplicación Android se mantiene en un repositorio independiente recomendado como
`myg-express-mobile`. La versión se declara en `pubspec.yaml` con el formato
`MAJOR.MINOR.PATCH+BUILD`, por ejemplo `1.2.0+12`.

- `MAJOR`: cambio incompatible o rediseño estructural.
- `MINOR`: funcionalidad nueva compatible.
- `PATCH`: corrección compatible.
- `BUILD`: entero Android único y siempre creciente.

## Publicación controlada

1. Incrementar `version:` y actualizar `CHANGELOG.md` en el repositorio móvil.
2. Ejecutar análisis, pruebas y generar un release firmado.
3. Crear el tag exacto `vMAJOR.MINOR.PATCH+BUILD`.
4. GitHub Actions publica APK, AAB y `SHA256SUMS.txt`.
5. Registrar el APK liberado en el backend:

```powershell
npm run mobile:release:publish -- `
  --version=1.2.0 `
  --build=12 `
  --minimum-build=10 `
  --channel=PRODUCTION `
  --download-url=https://downloads.myg-express.com/mobile/asistencia-myg-1.2.0+12.apk `
  --sha256=<SHA256_DEL_APK> `
  --notes="Mejoras de asistencia y estabilidad"
```

El comando rechaza versiones repetidas, builds no crecientes, URLs sin HTTPS,
checksums inválidos y una compilación mínima superior al release publicado.

## Política en ejecución

La app consulta `GET /api/mobile/rrhh/version-policy` antes de restaurar la sesión:

- si el build está vigente, inicia normalmente;
- si existe una versión nueva opcional, la informa en el perfil;
- si el build es menor al mínimo soportado, bloquea el acceso hasta actualizar;
- si la API falla temporalmente, usa durante 24 horas la última política válida.

Cada solicitud envía versión, build, plataforma y canal. El backend mantiene también
la última versión observada por dispositivo para soporte y auditoría.
