# Despliegue de producción

El VPS nunca debe ser el origen del código ni contener cambios manuales. Cada entrega parte de una etiqueta inmutable del repositorio y se instala en un directorio nuevo.

## 1. Preparación única

Crear un usuario de despliegue sin contraseña interactiva de root y concederle únicamente permisos para:

- administrar `/var/www/myg-express-releases` y `/var/www/myg-express-shared`;
- ejecutar el script de despliegue;
- recargar los procesos PM2 de la aplicación;
- leer la llave de despliegue privada del repositorio.

Estructura esperada:

```text
/var/www/myg-express-releases/   releases inmutables
/var/www/myg-express-current     enlace al release activo
/var/www/myg-express-shared/
├── config/backend.env
├── config/frontend.env.production
├── storage/
└── private-storage/
```

Nginx sirve `frontend-react/dist` a través de `myg-express-current` y redirige `/api` a `127.0.0.1:3000`.

## 2. Configuración y secretos

`backend.env` debe definir los valores de producción descritos en `backend/.env.example`. Como mínimo:

- conexión privada a MariaDB y Redis;
- `JWT_SECRET`, `PAYMENTS_DATA_ENCRYPTION_KEY` y `URBANO_CREDENTIALS_SECRET` independientes;
- `APP_CORS_ORIGINS=https://app.myg-express.com`;
- `APP_TRUST_PROXY_HOPS=1`;
- zona horaria `America/Lima` y `DB_TIMEZONE=-05:00`.

Los secretos no se copian al repositorio, al artefacto ni a los logs.

## 3. Respaldo obligatorio

Antes de cada migración:

```bash
export BACKUP_DIR=/ruta/cifrada/backups
export DB_HOST=127.0.0.1
export DB_PORT=3306
export DB_USER=usuario_backup
export DB_PASSWORD='valor-secreto'
export DB_NAME=sistema_mensajeria
./ops/backup-mariadb.sh
```

El respaldo debe copiarse fuera del VPS y probarse periódicamente con `ops/restore-drill-mariadb.sh`. No se despliega si el respaldo o su checksum no son válidos.

## 4. Crear una versión

La rama `main` debe estar protegida y CI debe finalizar correctamente.

```bash
git switch main
git pull --ff-only origin main
git tag -s v1.0.0 -m "MyG Express v1.0.0"
git push origin v1.0.0
```

Si todavía no existe una llave GPG corporativa, puede utilizarse temporalmente una etiqueta anotada (`git tag -a`), dejando documentada la transición.

## 5. Desplegar el tag

Desde el usuario restringido del VPS:

```bash
export RELEASE_REF=v1.0.0
export EXPECTED_COMMIT=commit_completo_aprobado
export BACKUP_FILE=/ruta/cifrada/backups/sistema_mensajeria_YYYYMMDDTHHMMSSZ.sql.gz
bash /opt/myg-express/deploy-release.sh
```

El script:

1. valida el respaldo y su checksum;
2. clona únicamente la etiqueta solicitada;
3. verifica opcionalmente el commit esperado;
4. enlaza configuración y almacenamiento persistentes;
5. instala dependencias de manera reproducible con `npm ci`;
6. compila backend y frontend;
7. ejecuta preflight, migraciones y verificadores;
8. activa el release mediante un cambio atómico de symlink;
9. recarga PM2;
10. valida `/api/health` e intenta rollback del código si falla.

Las migraciones deben seguir el patrón expand/contract para que el release anterior siga siendo compatible durante un rollback. Una migración destructiva requiere una ventana separada y un plan específico de restauración.

## 6. Verificación posterior

```bash
curl --fail https://app.myg-express.com/api/health
pm2 status
pm2 logs sistema-api --lines 100 --nostream
pm2 logs sistema-whatsapp-worker --lines 100 --nostream
readlink -f /var/www/myg-express-current
cat /var/www/myg-express-current/RELEASE_COMMIT
```

Verificar además autenticación, asistencia, solicitudes, GPS, pagos y una operación controlada del worker.

## 7. Aplicación Android

La aplicación móvil se publica desde su propio repositorio. Debe compilarse como AAB de release, firmarse con una llave empresarial fuera de Git y apuntar exclusivamente a la API HTTPS de producción.
