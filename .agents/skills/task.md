# Checklist de Tareas: SAVAR SCAN (Control de Lotes de Carga)

- [ ] **Base de Datos**
  - [ ] Ejecutar el comando SQL `ALTER TABLE` para añadir `lote_importacion` e índices a la tabla `paquetes`

- [ ] **Backend (API)**
  - [ ] Actualizar el controlador `backend/src/controllers/savarScanController.ts`:
    - [ ] Agregar endpoint `listarLotes` (`GET /api/savar-scan/lotes`)
    - [ ] Agregar endpoint `listarFaltantes` (`GET /api/savar-scan/faltantes`)
    - [ ] Modificar `importarPaquetes` para recibir y asignar el nombre de `lote_importacion`
    - [ ] Modificar `procesarEscaneo` para validar si el paquete pertenece a otro lote y devolver `OTRO_LOTE`
  - [ ] Registrar las nuevas rutas en `backend/src/routes/savarScanRoutes.ts`

- [ ] **Frontend (Interfaz de Usuario)**
  - [ ] Modificar `frontend/savar-scan.html`:
    - [ ] Añadir panel de progreso activo con barra de progreso, contadores de recibidos/faltantes
    - [ ] Añadir selector de Lotes
    - [ ] Añadir modal de "Ver Faltantes"
    - [ ] Añadir input de nombre del lote en el modal de importación
  - [ ] Actualizar `frontend/css/savar-scan.css`:
    - [ ] Añadir estilos para la barra de progreso, panel de estadísticas de lote y modal de faltantes
    - [ ] Añadir clase `.state-other-lote` (color azul/celeste para cruces de lotes)
  - [ ] Actualizar `frontend/js/savar-scan.js`:
    - [ ] Cargar lista de lotes al iniciar
    - [ ] Manejar cambios en el lote seleccionado
    - [ ] Actualizar estadísticas de lote en tiempo real al escanear
    - [ ] Manejar visualización e importación con el nuevo campo de lote
    - [ ] Programar lógica del modal de "Ver Faltantes"

- [ ] **Verificación y Pruebas**
  - [ ] Compilar el backend con TypeScript (`npm run build`)
  - [ ] Probar la importación creando un lote con 10 paquetes de prueba
  - [ ] Probar la detección de "Carga Completa"
  - [ ] Probar la alerta de "Pertenece a otro lote"
