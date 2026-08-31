# Sistema de Mensajería — Backend

API REST construida con **Node.js + TypeScript + Express + MySQL** para gestionar clientes, plantillas, campañas y el historial de mensajes de una empresa de logística.

---

## Requisitos previos

- Node.js v18 o superior
- MySQL 8.0 o superior
- npm

---

## 1. Instalar dependencias

```bash
cd backend
npm install
```

---

## 2. Configurar variables de entorno

Copia el archivo de ejemplo y edítalo con tus datos:

```bash
cp .env.example .env
```

Edita `.env`:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=sistema_mensajeria
```

---

## 3. Crear la base de datos

Ejecuta el script SQL incluido en la raíz del proyecto:

```bash
mysql -u root -p < ../database.sql
```

O ábrelo manualmente en MySQL Workbench / DBeaver y ejecútalo.

---

## 4. Ejecutar el proyecto

### Modo desarrollo (con recarga automática)

```bash
npm run dev
```

### Modo producción

```bash
npm run build
npm start
```

El servidor estará disponible en: `http://localhost:3000`

---

## Endpoints disponibles

### Clientes

| Método | Ruta              | Descripción              |
|--------|-------------------|--------------------------|
| GET    | /clientes         | Listar todos los clientes|
| POST   | /clientes         | Registrar nuevo cliente  |
| PUT    | /clientes/:id     | Actualizar cliente       |
| DELETE | /clientes/:id     | Eliminar cliente         |

### Plantillas

| Método | Ruta              | Descripción               |
|--------|-------------------|---------------------------|
| GET    | /plantillas       | Listar plantillas         |
| POST   | /plantillas       | Crear nueva plantilla     |

### Campañas

| Método | Ruta              | Descripción               |
|--------|-------------------|---------------------------|
| GET    | /campanas         | Listar campañas           |
| POST   | /campanas         | Crear nueva campaña       |

### Mensajes

| Método | Ruta                      | Descripción                        |
|--------|---------------------------|------------------------------------|
| POST   | /mensajes/enviar-campana  | Generar y enviar mensajes masivos  |
| GET    | /mensajes/historial       | Ver historial de mensajes enviados |

---

## Ejemplo de uso

### Registrar un cliente

```bash
curl -X POST http://localhost:3000/clientes \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Juan Pérez","telefono":"51987654321","ciudad":"Lima","codigo_pedido":"PED-010","estado_envio":"entregado"}'
```

### Enviar una campaña

```bash
curl -X POST http://localhost:3000/mensajes/enviar-campana \
  -H "Content-Type: application/json" \
  -d '{"campana_id": 1, "clientes_ids": [1, 2, 3]}'
```

---

## Estructura del proyecto

```
backend/
├── src/
│   ├── config/
│   │   └── database.ts        # Conexión MySQL (pool)
│   ├── controllers/
│   │   ├── clientesController.ts
│   │   ├── plantillasController.ts
│   │   ├── campanasController.ts
│   │   └── mensajesController.ts
│   ├── routes/
│   │   ├── clientesRoutes.ts
│   │   ├── plantillasRoutes.ts
│   │   ├── campanasRoutes.ts
│   │   └── mensajesRoutes.ts
│   ├── services/
│   │   └── whatsappService.ts # Servicio simulado (listo para integración real)
│   ├── utils/
│   │   └── messageFormatter.ts # Reemplaza variables {nombre} en plantillas
│   └── app.ts                 # Entrada principal
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Integración de WhatsApp

El sistema utiliza exclusivamente **Evolution API** como proveedor de WhatsApp. La API y el worker se conectan mediante `EVOLUTION_API_URL` y `EVOLUTION_API_APIKEY`; las actualizaciones de sesión se reciben en `EVOLUTION_API_WEBHOOK_URL`.
