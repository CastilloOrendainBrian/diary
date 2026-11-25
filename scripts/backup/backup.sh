#!/bin/sh
# Dumps the database with the read-only backup role and removes dumps older than the retention.
# Environment:
#   PGHOST, PGDATABASE, PGUSER     connection (defaults: postgres, diary, diary_backup)
#   BACKUP_PASSWORD_FILE           path to the backup role password (Docker secret)
#   BACKUP_INTERVAL_SECONDS        time between dumps (default 86400)
#   BACKUP_RETENTION_DAYS          age after which dumps are deleted (default 14)
set -eu

PGHOST="${PGHOST:-postgres}"
PGDATABASE="${PGDATABASE:-diary}"
PGUSER="${PGUSER:-diary_backup}"
export PGHOST PGDATABASE PGUSER
PGPASSWORD="$(cat "${BACKUP_PASSWORD_FILE:?BACKUP_PASSWORD_FILE is required}")"
export PGPASSWORD

INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
DEST=/backups

mkdir -p "$DEST"

while true; do
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  target="$DEST/diary-$stamp.dump"

  # Write to a temporary name first, so an interrupted dump never looks like a valid backup.
  if pg_dump -Fc -f "$target.partial"; then
    mv "$target.partial" "$target"
    echo "backup ok: $target"
  else
    rm -f "$target.partial"
    echo "backup FAILED at $stamp" >&2
  fi

  find "$DEST" -name 'diary-*.dump' -mtime +"$RETENTION_DAYS" -delete
  sleep "$INTERVAL"
done
