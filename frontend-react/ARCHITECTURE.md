# Arquitectura del frontend

## Principios

El frontend usa React, TypeScript estricto y Vite. La migración desde las hojas de estilo heredadas es incremental: cada superficie nueva o modificada debe quedar encapsulada, tipada y comprobada antes de eliminar su implementación anterior.

1. `src/styles` contiene únicamente tokens, reset y contrato global.
2. Los estilos de una característica se implementan con CSS Modules.
3. Los componentes de `src/components/ui` no contienen lógica de negocio.
4. Cada `feature` separa componentes, hooks, servicios HTTP y tipos.
5. Los componentes no llaman Axios directamente; consumen servicios tipados.
6. Los errores recibidos desde la API se normalizan en `core/api`.
7. No se introducen nuevos `any`, selectores globales de página ni estilos estáticos inline.

## Módulo de rutas

```text
features/logistica/routes/
├── components/
│   ├── RouteEditorModal.tsx
│   ├── RouteListSection.tsx
│   ├── RouteReportModal.tsx
│   ├── RouteRowActions.tsx
│   ├── RoutesHistoryModal.tsx
│   ├── RoutesOverview.tsx
│   └── RoutesToolbar.tsx
├── hooks/
│   └── useRoutesData.ts
├── formatters.ts
├── routes.service.ts
├── RoutesPage.module.css
└── types.ts
```

- `routes.service.ts` define los únicos endpoints que consume esta pantalla.
- `useRoutesData.ts` controla carga, cancelación, orden y actualización de datos.
- Los componentes visuales reciben datos y callbacks mediante props.
- Los cálculos de fechas operativas usan `America/Lima`.
- El gráfico de tendencia usa SVG accesible y responsivo, sin una dependencia pesada de visualización.
- La migración de componentes, modales, menús y estilos de Rutas está completa.

## Estrategia de migración

`src/css` sigue conteniendo estilos heredados de pantallas que aún no han sido migradas. No se deben ampliar esas hojas. El orden recomendado es:

1. Migrar Detalle de ruta.
2. Migrar WhatsApp Sessions.
3. Migrar Savar Scan y Gestión de entregas.
4. Migrar Administración, RR. HH. y GPS.
5. Retirar cada hoja heredada cuando su pantalla termine la migración.

Los estilos heredados ya no forman parte del CSS inicial: cada pantalla los importa dentro de su propio chunk de ruta mientras se completa su migración.

## Controles obligatorios

Antes de integrar cambios:

```bash
npm run lint
npm run test:run
npm run build
npm audit --audit-level=high
```
