# Despliegue en produccion

Este proyecto esta preparado para desplegarse con:

- `Nginx` sirviendo el frontend estatico
- `Node.js + PM2` para el backend
- `MariaDB/MySQL`
- dominio con `HTTPS`

## Estructura

- `frontend/`: archivos estaticos HTML, CSS y JS
- `backend/`: API Node.js con Express

## Variables de entorno

Usa `backend/.env.example` como base y crea `backend/.env`:

```env
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=sistema_mensajeria
JWT_SECRET=tu_secreto_seguro
SUPERADMIN_USERS=jhoyner
```

## Frontend

El frontend ya consume la API con base relativa:

```js
const API_BASE = window.__API_BASE__ || '/api';
```

Esto permite que Nginx resuelva `/api` hacia el backend sin hardcodear `localhost`.

## Backend

El backend escucha en:

```ts
app.listen(process.env.PORT || 3000, '0.0.0.0')
```

Y expone la API bajo el prefijo:

- `/api/auth`
- `/api/lotes`
- `/api/avisos`
- `/api/plantillas`
- `/api/whatsapp`
- `/api/whatsapp-sesiones`
- `/api/admin`

## Nginx

Ejemplo de configuracion:

```nginx
server {
    listen 80;
    server_name tu-dominio.com www.tu-dominio.com;

    root /var/www/myg-express/frontend;
    index login.html;

    location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2)$ {
        try_files $uri =404;
        access_log off;
        expires 7d;
    }

    location / {
        try_files $uri $uri/ /login.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## PM2

Instala dependencias, compila y ejecuta:

```bash
cd /var/www/myg-express/backend
npm install
npm run build
pm2 start dist/app.js --name myg-express-api
pm2 save
pm2 startup
```

## TLS / HTTPS

Despues de tener Nginx funcionando, instala HTTPS con Certbot:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com
```

## Notas

- `whatsapp-web.js` necesita almacenamiento persistente en disco.
- No uses hosting serverless para este backend.
- Para produccion conviene activar backups del VPS y de la base de datos.
