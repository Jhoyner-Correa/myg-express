#!/usr/bin/env bash
set -Eeuo pipefail

umask 027

: "${RELEASE_REF:?Define RELEASE_REF con una etiqueta, por ejemplo v1.0.0}"
: "${BACKUP_FILE:?Define BACKUP_FILE con el respaldo MariaDB verificado}"

REPO_URL="${REPO_URL:-git@github.com:Jhoyner-Correa/myg-express.git}"
APP_ROOT="${APP_ROOT:-/var/www/myg-express-releases}"
CURRENT_LINK="${CURRENT_LINK:-/var/www/myg-express-current}"
SHARED_ROOT="${SHARED_ROOT:-/var/www/myg-express-shared}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
LOCK_FILE="${DEPLOY_LOCK_FILE:-${SHARED_ROOT}/deploy.lock}"
EXPECTED_COMMIT="${EXPECTED_COMMIT:-}"
WEB_GROUP="${WEB_GROUP:-www-data}"

case "${RELEASE_REF}" in
  v[0-9]*.[0-9]*.[0-9]*|v[0-9]*.[0-9]*.[0-9]*-*) ;;
  *)
    echo "RELEASE_REF debe ser una etiqueta semántica (v1.2.3)." >&2
    exit 1
    ;;
esac

test -f "${BACKUP_FILE}"
test -f "${BACKUP_FILE}.sha256"
(cd "$(dirname "${BACKUP_FILE}")" && sha256sum -c "$(basename "${BACKUP_FILE}.sha256")")

install -d -m 02750 -o root -g "${WEB_GROUP}" "${APP_ROOT}"
mkdir -p "${SHARED_ROOT}/storage" "${SHARED_ROOT}/private-storage" "${SHARED_ROOT}/config"
test -f "${SHARED_ROOT}/config/backend.env"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Ya existe otro despliegue de MyG Express en ejecución." >&2
  exit 1
fi

SAFE_REF="${RELEASE_REF//[^A-Za-z0-9._-]/_}"
RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)-${SAFE_REF}"
PARTIAL_DIR="${APP_ROOT}/.${RELEASE_ID}.partial"
RELEASE_DIR="${APP_ROOT}/${RELEASE_ID}"
PREVIOUS_TARGET="$(readlink -f "${CURRENT_LINK}" 2>/dev/null || true)"

cleanup() {
  if [[ -d "${PARTIAL_DIR}" ]]; then
    rm -rf -- "${PARTIAL_DIR}"
  fi
}
trap cleanup EXIT

git clone --depth 1 --branch "${RELEASE_REF}" "${REPO_URL}" "${PARTIAL_DIR}"
ACTUAL_COMMIT="$(git -C "${PARTIAL_DIR}" rev-parse HEAD)"
if [[ -n "${EXPECTED_COMMIT}" && "${ACTUAL_COMMIT}" != "${EXPECTED_COMMIT}" ]]; then
  echo "El commit clonado no coincide con EXPECTED_COMMIT." >&2
  exit 1
fi

prepare_shared_link() {
  local source_path="$1"
  local target_path="$2"

  if [[ -L "${target_path}" ]]; then
    echo "El clon contiene un enlace inesperado: ${target_path}" >&2
    exit 1
  fi

  if [[ -d "${target_path}" ]]; then
    local unexpected_entry
    unexpected_entry="$(find "${target_path}" -mindepth 1 -maxdepth 1 ! -name '.gitignore' -print -quit)"
    if [[ -n "${unexpected_entry}" ]]; then
      echo "No se reemplazara un directorio con contenido inesperado: ${target_path}" >&2
      exit 1
    fi
    rm -f -- "${target_path}/.gitignore"
    rmdir -- "${target_path}"
  elif [[ -e "${target_path}" ]]; then
    echo "El destino persistente ya existe y no es un directorio: ${target_path}" >&2
    exit 1
  fi

  ln -s "${source_path}" "${target_path}"
}

ln -s "${SHARED_ROOT}/config/backend.env" "${PARTIAL_DIR}/backend/.env"
prepare_shared_link "${SHARED_ROOT}/storage" "${PARTIAL_DIR}/backend/storage"
prepare_shared_link "${SHARED_ROOT}/private-storage" "${PARTIAL_DIR}/backend/private-storage"
if [[ -f "${SHARED_ROOT}/config/frontend.env.production" ]]; then
  ln -s "${SHARED_ROOT}/config/frontend.env.production" "${PARTIAL_DIR}/frontend-react/.env.production"
fi

npm --prefix "${PARTIAL_DIR}/backend" ci
npm --prefix "${PARTIAL_DIR}/backend" run build
npm --prefix "${PARTIAL_DIR}/frontend-react" ci
npm --prefix "${PARTIAL_DIR}/frontend-react" run build

(
  cd "${PARTIAL_DIR}/backend"
  npm run db:migrate
  npm run db:verify:rrhh-schema
)

printf '%s\n' "${ACTUAL_COMMIT}" > "${PARTIAL_DIR}/RELEASE_COMMIT"
printf '%s\n' "${RELEASE_REF}" > "${PARTIAL_DIR}/RELEASE_VERSION"
mv "${PARTIAL_DIR}" "${RELEASE_DIR}"

# El código permanece propiedad de root; el grupo del servidor web obtiene
# solo lectura/travesía para servir el frontend compilado. El bit setgid del
# directorio de releases conserva este grupo en despliegues posteriores.
chgrp -R "${WEB_GROUP}" "${RELEASE_DIR}"
chmod -R g+rX "${RELEASE_DIR}"

NEXT_LINK="${CURRENT_LINK}.next"
ln -sfn "${RELEASE_DIR}" "${NEXT_LINK}"
mv -Tf "${NEXT_LINK}" "${CURRENT_LINK}"

if ! PM2_BACKEND_CWD="${CURRENT_LINK}/backend" pm2 startOrReload "${CURRENT_LINK}/backend/ecosystem.config.js" --update-env; then
  if [[ -n "${PREVIOUS_TARGET}" && -d "${PREVIOUS_TARGET}" ]]; then
    ln -sfn "${PREVIOUS_TARGET}" "${NEXT_LINK}"
    mv -Tf "${NEXT_LINK}" "${CURRENT_LINK}"
    PM2_BACKEND_CWD="${CURRENT_LINK}/backend" pm2 startOrReload "${CURRENT_LINK}/backend/ecosystem.config.js" --update-env || true
  fi
  exit 1
fi

for attempt in {1..20}; do
  if curl --fail --silent --show-error "${HEALTH_URL}" >/dev/null; then
    pm2 save
    printf 'Release activo: %s (%s)\n' "${RELEASE_REF}" "${ACTUAL_COMMIT}"
    exit 0
  fi
  sleep 2
done

echo "El health check falló; se intentará restaurar el release anterior." >&2
if [[ -n "${PREVIOUS_TARGET}" && -d "${PREVIOUS_TARGET}" ]]; then
  ln -sfn "${PREVIOUS_TARGET}" "${NEXT_LINK}"
  mv -Tf "${NEXT_LINK}" "${CURRENT_LINK}"
  PM2_BACKEND_CWD="${CURRENT_LINK}/backend" pm2 startOrReload "${CURRENT_LINK}/backend/ecosystem.config.js" --update-env || true
fi
exit 1
