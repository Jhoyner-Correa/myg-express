# Despliegue en produccion

MyG Express debe correr con procesos separados. La API no debe procesar la cola de WhatsApp dentro del mismo proceso.

## Arquitectura recomendada

- `api`: Express, frontend, autenticacion, rutas, consultas y endpoints.
- `worker-whatsapp`: BullMQ worker, envio de mensajes y tareas de WhatsApp.
- `redis-myg`: Redis dedicado para BullMQ.
- `mariadb/mysql`: base de datos del sistema.
- `evolution-api`: proveedor WhatsApp separado.

No uses el Redis interno de Evolution para MyG Express. Redis de MyG debe ser dedicado para evitar cruces de datos, reinicios inesperados y consumo de memoria mezclado.

## Variables importantes

Copia `backend/.env.example` a `backend/.env` y configura:

```env
PORT=3000
WHATSAPP_WORKER_PORT=3001
APP_TIME_ZONE=America/Lima
DB_TIMEZONE=-05:00

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=sistema_mensajeria

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0

JWT_SECRET=cambia_esto_por_un_secreto_seguro
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_APIKEY=tu_clave_api_global_de_evolution
EVOLUTION_API_WEBHOOK_URL=http://host.docker.internal:3000/api/whatsapp/webhook
```

`APP_TIME_ZONE` define el calendario empresarial y `DB_TIMEZONE` fija cada sesion MySQL/MariaDB. Mantener ambos valores evita diferencias de cinco horas entre `DATETIME`, `TIMESTAMP`, asistencia y reportes diarios. En PM2 y Docker tambien se configura `TZ=America/Lima`.

Si ejecutas API y worker dentro de Docker pero MariaDB esta en Windows/XAMPP o en el host, usa:

```env
DB_HOST=host.docker.internal
```

Compose usa por defecto `DOCKER_DB_HOST=host.docker.internal` y `DOCKER_EVOLUTION_API_URL=http://host.docker.internal:8080`; puedes sobrescribirlos si MariaDB o Evolution viven en otra maquina.

## Desarrollo local recomendado

Levanta Redis dedicado:

```powershell
docker compose up -d redis-myg
```

Terminal 1, API:

```powershell
cd C:\Users\JHOYNER\Downloads\sistema-mensajeria\backend
npm run dev
```

Terminal 2, worker:

```powershell
cd C:\Users\JHOYNER\Downloads\sistema-mensajeria\backend
npm run dev:worker
```

La API queda en `http://localhost:3000` y el worker en `http://localhost:3001`.

## Produccion con Docker Compose

Configura `backend/.env` con credenciales reales y luego:

```bash
cd /var/www/myg-express
cd backend && npm ci && npm run db:preflight && cd ..
docker compose up -d --build
```

La imagen usa construccion multi-stage: compila React/Vite, compila TypeScript y copia solamente los artefactos y dependencias de produccion a la imagen final.

Ver estado:

```bash
docker compose ps
docker compose logs -f api
docker compose logs -f worker-whatsapp
docker compose logs -f redis-myg
```

Reiniciar solo worker:

```bash
docker compose restart worker-whatsapp
```

## Produccion con PM2

Instala Redis como servicio o levantalo con Docker:

```bash
docker run -d --name myg-redis \
  -p 127.0.0.1:6379:6379 \
  -v myg-redis-data:/data \
  --restart unless-stopped \
  redis:7-alpine redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy noeviction
```

Compila frontend y backend:

```bash
cd /var/www/myg-express/frontend-react
npm ci
npm run build

cd /var/www/myg-express/backend
npm ci
npm run build
npm run db:preflight
```

Antes del primer despliegue de esta version, y siempre despues de un backup verificado, aplica una sola vez la migracion idempotente de integridad:

```bash
npm run db:migrate:integrity
```

El comando ejecuta primero el preflight y se detiene si encuentra datos huerfanos o duplicados.

Para versiones que incorporan el aislamiento de SAVAR SCAN por sede, ejecuta primero
`backend/migrations/003_savar_sede_preflight.sql` desde phpMyAdmin. Si
`lotes_que_requieren_decision` devuelve `0`, aplica la migracion idempotente:

```bash
npm run db:migrate:savar-sede
```

El comando conserva los paquetes existentes, asigna su sede cuando puede inferirla sin
ambiguedad y crea la clave foranea e indices multi-sede. Si detecta un lote operado por
varias sedes, se detiene sin decidir ni eliminar datos.

Para habilitar la aplicación móvil y los flujos administrativos de RR. HH., aplica las
migraciones en orden después de verificar el respaldo de MariaDB:

```bash
npm run db:migrate:rrhh-foundation
npm run db:migrate:rrhh-incidents
```

Ambos comandos usan un candado de base de datos y migraciones idempotentes. El segundo
agrega permisos, vacaciones, resolución administrativa y el historial inmutable de
correcciones de asistencia.

Arranca API y worker separados:

```bash
pm2 start dist/app.js --name myg-api
pm2 start dist/worker.js --name myg-worker-whatsapp
pm2 save
pm2 startup
```

Ver logs:

```bash
pm2 logs myg-api
pm2 logs myg-worker-whatsapp
```

## Nginx

Ejemplo si la API sirve tambien el frontend:

```nginx
server {
    listen 80;
    server_name tu-dominio.com www.tu-dominio.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Checklist antes de produccion

- Redis dedicado activo y persistente.
- API y worker corriendo como procesos separados.
- `WHATSAPP_WORKER_REQUIRE_DB_LOCK=true` para evitar dos workers enviando al mismo tiempo.
- `WHATSAPP_WORKER_CONCURRENCY=1` para respetar orden y reducir bloqueos.
- `EVOLUTION_API_WEBHOOK_URL` apuntando a la URL publica correcta de tu API.
- Backups de MariaDB activos.
- `npm run db:preflight` sin hallazgos antes de migrar.
- Preflight SAVAR sin lotes ambiguos y `npm run db:migrate:savar-sede` aplicado.
- Frontend y backend compilando sin errores.
- Redis no expuesto publicamente a internet.

## HTTPS

Despues de tener Nginx funcionando:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com
```
