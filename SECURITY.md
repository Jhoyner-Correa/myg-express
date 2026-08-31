# Seguridad

Este es un repositorio privado de una plataforma empresarial. Los incidentes deben comunicarse directamente al responsable técnico de MyG Express y no mediante issues públicos.

## Información prohibida en Git

- contraseñas y tokens;
- archivos `.env` reales;
- llaves SSH o de firma Android;
- respaldos de MariaDB;
- fotografías, selfies y sustentos de colaboradores;
- exportaciones con datos personales o bancarios;
- logs productivos.

Si un secreto llega al historial, eliminar el archivo no es suficiente: debe rotarse inmediatamente y luego sanearse el historial.

## Producción

- Usar un usuario de despliegue sin acceso root interactivo.
- Autenticar GitHub Actions con una llave exclusiva y restringida.
- Proteger `main`, exigir pull request y exigir los controles de CI.
- Proteger el entorno `production` con aprobación manual.
- Mantener respaldos cifrados fuera del VPS y probar su restauración.
