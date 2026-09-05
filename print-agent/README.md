# Agente local de impresion

Este proceso debe ejecutarse en el equipo Windows que puede acceder a la impresora Luxur compartida.

1. Aplica las migraciones del backend.
2. Registra el agente desde `backend` configurando `PRINT_AGENT_SITE_ID`, `PRINT_AGENT_NAME` y `PRINT_AGENT_PRINTER`, y ejecuta `npm run print-agent:register`.
3. Copia `.env.example` como `.env`, completa la URL y pega el token generado.
4. Instala Node.js 18 o superior y ejecuta `npm start` dentro de esta carpeta.

El agente consulta una cola persistente. Si pierde conexion, los trabajos permanecen en el servidor. Un trabajo cuyo envio quede incierto pasa a **Error** y debe revisarse antes de reintentarlo para evitar impresiones duplicadas.
