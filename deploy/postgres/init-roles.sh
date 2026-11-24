#!/bin/sh
# Runs once, when the PostgreSQL data volume is initialized
# (mounted in /docker-entrypoint-initdb.d). Creates the least-privilege
# application roles and applies their grants.
#
# Environment:
#   POSTGRES_USER, POSTGRES_DB       provided by the official postgres image (owner role and main DB)
#   DIARY_APP_PASSWORD               password of the runtime role diary_app (required)
#   DIARY_BACKUP_PASSWORD            password of the backup role diary_backup (required)
#   DIARY_TEST_DATABASE              "true" to also create the diary_test database (development only)
set -eu

: "${DIARY_APP_PASSWORD:?DIARY_APP_PASSWORD is required}"
: "${DIARY_BACKUP_PASSWORD:?DIARY_BACKUP_PASSWORD is required}"

# Mounted outside /docker-entrypoint-initdb.d on purpose: the image would run it
# automatically before the roles exist.
GRANTS_SQL="/opt/diary/grant-privileges.sql"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
CREATE ROLE diary_app LOGIN PASSWORD '${DIARY_APP_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE diary_backup LOGIN PASSWORD '${DIARY_BACKUP_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
EOSQL

# POSTGRES_USER is the owner role (diary_owner) and also runs the grants.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$GRANTS_SQL"

if [ "${DIARY_TEST_DATABASE:-false}" = "true" ]; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -c "CREATE DATABASE diary_test OWNER ${POSTGRES_USER};"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname diary_test -f "$GRANTS_SQL"
fi
