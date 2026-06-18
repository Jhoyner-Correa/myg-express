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

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=sistema_mensajeria

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0

JWT_SECRET=cambia_esto_por_un_secreto_seguro
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_APIKEY=tu_clave_api_global_de_evolution
EVOLUTION_API_WEBHOOK_URL=http://host.docker.internal:3000/api/whatsapp/webhook
```

Si ejecutas API y worker dentro de Docker pero MariaDB esta en Windows/XAMPP o en el host, usa:

```env
DB_HOST=host.docker.internal
```

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
docker compose up -d --build
```

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

Compila backend:

```bash
cd /var/www/myg-express/backend
npm ci
npm run build
```

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
- Redis no expuesto publicamente a internet.

## HTTPS

Despues de tener Nginx funcionando:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com
```
