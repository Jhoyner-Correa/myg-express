# Plataforma MyG Express

Plataforma empresarial de MyG Express para operaciones logísticas, mensajería, Recursos Humanos, asistencia, ubicación y pagos por servicios.

Este repositorio contiene exclusivamente el sistema web y su API. La aplicación móvil Flutter se mantiene en un repositorio independiente para evitar mezclar artefactos Android con el despliegue del VPS.

## Componentes

| Componente | Tecnología | Responsabilidad |
| --- | --- | --- |
| `frontend-react/` | React, TypeScript y Vite | Interfaz administrativa |
| `backend/` | Node.js, Express y TypeScript | API, dominio, persistencia y worker |
| `backend/migrations/` | SQL para MySQL 8 / MariaDB 10.4+ | Esquema inicial y evolución reproducible |
| `ops/` | Shell | Respaldo, restauración y operación |
| `.github/workflows/` | GitHub Actions | Calidad y compilación verificable |

## Desarrollo local

Requisitos: Node.js 20, MySQL 8 o MariaDB 10.4+, y Redis 7.

```bash
cd backend
cp .env.example .env
npm ci
npm run dev
```

En otra terminal:

```bash
cd frontend-react
cp .env.example .env
npm ci
npm run dev
```

## Verificación

Antes de integrar cualquier cambio:

```bash
cd backend
npm ci
npm test

cd ../frontend-react
npm ci
npm run lint
npm run test:run
npm run build
```

Las migraciones productivas se ejecutan únicamente después de un respaldo restaurable:

```bash
cd backend
npm run db:migrate
npm run db:verify:rrhh-schema
```

`001_initial_schema.sql` construye una instalación nueva y vacía. Incluye únicamente
la estructura y los catálogos técnicos de autorización; no copia usuarios, empleados
ni información operativa del entorno local. Después de aplicarla no debe editarse:
cada cambio futuro se incorpora como una nueva migración incremental `002_...sql`,
`003_...sql`, etc.

## Flujo de entrega

1. Crear una rama corta desde `main`.
2. Implementar y probar localmente.
3. Abrir un pull request y esperar que CI finalice correctamente.
4. Integrar en `main` sin subir secretos ni artefactos compilados.
5. Crear una etiqueta versionada.
6. Desplegar exactamente ese commit mediante un release inmutable.
7. Ejecutar health checks y conservar una ruta de rollback.

Consulta [DEPLOY.md](DEPLOY.md), [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) y [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) antes de operar producción.

## Seguridad

- Los archivos `.env`, credenciales, llaves Android, respaldos y evidencias privadas no pertenecen al repositorio.
- Los datos de prueba se encuentran en `backend/seeds/` y nunca se ejecutan automáticamente en producción.
- MariaDB y Redis deben permanecer en red privada.
- Todo secreto utilizado durante desarrollo debe rotarse antes de una salida productiva.
