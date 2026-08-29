#!/usr/bin/env sh
set -eu

: "${BACKUP_FILE:?Define BACKUP_FILE}"
: "${DB_HOST:?Define DB_HOST}"
: "${DB_USER:?Define DB_USER}"
: "${DB_PASSWORD:?Define DB_PASSWORD}"
: "${RESTORE_DATABASE:?Define RESTORE_DATABASE con una base temporal vacia}"

DB_PORT="${DB_PORT:-3306}"
case "${RESTORE_DATABASE}" in
  *_restore_drill) ;;
  *)
    echo "RESTORE_DATABASE debe terminar en _restore_drill para impedir sobrescribir produccion." >&2
    exit 1
    ;;
esac

test -f "${BACKUP_FILE}"
gzip -t "${BACKUP_FILE}"

export MYSQL_PWD="${DB_PASSWORD}"
mysql --host="${DB_HOST}" --port="${DB_PORT}" --user="${DB_USER}" \
  -e "CREATE DATABASE IF NOT EXISTS \`${RESTORE_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
gzip -cd "${BACKUP_FILE}" | mysql \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  "${RESTORE_DATABASE}"
TABLE_COUNT="$(mysql --host="${DB_HOST}" --port="${DB_PORT}" --user="${DB_USER}" --batch --skip-column-names \
  -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${RESTORE_DATABASE}';")"
unset MYSQL_PWD

test "${TABLE_COUNT}" -gt 0
printf 'Restauracion de prueba completada: %s tablas en %s\n' "${TABLE_COUNT}" "${RESTORE_DATABASE}"
printf 'La base temporal se conserva para inspeccion y debe eliminarse manualmente al terminar.\n'
