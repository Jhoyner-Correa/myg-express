#!/usr/bin/env sh
set -eu

: "${BACKUP_DIR:?Define BACKUP_DIR}"
: "${DB_HOST:?Define DB_HOST}"
: "${DB_USER:?Define DB_USER}"
: "${DB_PASSWORD:?Define DB_PASSWORD}"
: "${DB_NAME:?Define DB_NAME}"

DB_PORT="${DB_PORT:-3306}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
PRIVATE_STORAGE_DIR="${PRIVATE_STORAGE_DIR:-/var/www/myg-express-shared/private-storage}"
PUBLIC_STORAGE_DIR="${PUBLIC_STORAGE_DIR:-/var/www/myg-express-shared/storage}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DATABASE_BACKUP="${BACKUP_DIR}/${DB_NAME}_${STAMP}.sql.gz"
FILES_BACKUP="${BACKUP_DIR}/${DB_NAME}_files_${STAMP}.tar.gz"

umask 077
mkdir -p "${BACKUP_DIR}"

export MYSQL_PWD="${DB_PASSWORD}"
mysqldump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --hex-blob \
  --default-character-set=utf8mb4 \
  "${DB_NAME}" | gzip -9 > "${DATABASE_BACKUP}"
unset MYSQL_PWD

test -s "${DATABASE_BACKUP}"
gzip -t "${DATABASE_BACKUP}"
sha256sum "${DATABASE_BACKUP}" > "${DATABASE_BACKUP}.sha256"

tar -czf "${FILES_BACKUP}" \
  -C / \
  "${PRIVATE_STORAGE_DIR#/}" \
  "${PUBLIC_STORAGE_DIR#/}"
test -s "${FILES_BACKUP}"
gzip -t "${FILES_BACKUP}"
sha256sum "${FILES_BACKUP}" > "${FILES_BACKUP}.sha256"

find "${BACKUP_DIR}" -type f -mtime "+${BACKUP_RETENTION_DAYS}" -delete
printf 'Backup verificado: %s\n' "${DATABASE_BACKUP}"
printf 'Archivos verificados: %s\n' "${FILES_BACKUP}"
