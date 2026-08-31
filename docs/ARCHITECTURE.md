# Arquitectura de la plataforma

## Límites del repositorio

```text
Navegador
   |
   v
Frontend React ---- HTTPS ---- API Express ---- MariaDB
                                   |
                                   +------------ Redis
                                   |
                                   +------------ Worker de WhatsApp
                                   |
                                   +------------ almacenamiento privado
```

La aplicación Flutter consume la API publicada, pero se desarrolla y versiona en su propio repositorio.

## Principios

- `main` representa código integrable y verificable.
- Un release se identifica por una etiqueta y un commit inmutable.
- La base de datos productiva no se reemplaza con copias de desarrollo.
- El esquema evoluciona mediante migraciones ordenadas, idempotentes y verificadas.
- Los uploads, fotografías, evidencias y respaldos sobreviven a los releases y no se almacenan en Git.
- API y worker son procesos independientes.
- Nginx es el único punto público; MariaDB, Redis y procesos Node permanecen en red privada.

## Base de datos

`backend/src/scripts/runMigrations.ts` define la secuencia canónica. El proceso incluye preflight, transformación conservadora, migraciones funcionales, retiro controlado de estructuras heredadas y verificaciones finales.

La ejecución productiva requiere:

1. respaldo consistente;
2. prueba real de restauración;
3. preflight sin inconsistencias;
4. migración desde el mismo commit que se desplegará;
5. verificadores de acceso y RR. HH.;
6. registro del resultado en la bitácora del release.

## Releases

Cada versión se instala en un directorio nuevo. El tráfico cambia mediante un enlace simbólico únicamente después de compilar, migrar y validar salud. El release anterior se conserva para rollback, mientras los datos persistentes se comparten fuera de los directorios versionados.
