# Flujo de Git y releases

## Reglas del repositorio

- No trabajar directamente sobre el VPS.
- No usar el servidor como origen de cambios.
- No ejecutar `git pull` sobre una carpeta con modificaciones manuales.
- No confirmar `.env`, contraseñas, tokens, dumps reales, evidencias, APK, AAB ni llaves de firma.
- No ejecutar seeds de demostración en producción.

## Integración

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/nombre-del-cambio
```

Después de implementar y validar:

```bash
git add --all
git diff --cached
git commit -m "feat(area): descripción concreta"
git push -u origin feat/nombre-del-cambio
```

El cambio se integra mediante pull request después de que CI apruebe backend, frontend y construcción del contenedor.

## Versionado

Las etiquetas siguen versionado semántico:

- `v1.0.0`: versión estable;
- `v1.1.0`: funcionalidad compatible;
- `v1.1.1`: corrección compatible;
- `v2.0.0`: cambio incompatible.

El VPS debe registrar el identificador del commit desplegado. Nunca se despliega una carpeta local no confirmada.

## Reconstrucción inicial de `main`

Si se decide reiniciar el historial, primero se conserva el historial anterior en una rama y etiqueta de archivo. Después se crea una rama huérfana con el snapshot revisado, se valida en un clon temporal y finalmente se reemplaza `main` mediante `--force-with-lease`. `--force` sin protección no está permitido.
