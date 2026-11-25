#!/bin/sh
# Creates ./secrets with random passwords, the connection strings that use them, and the
# HMAC key. Existing files are never overwritten. The Resend API key cannot be generated:
# copy it into secrets/resend_api_key.txt yourself (or pass RESEND_API_KEY in the environment).
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/secrets"
umask 022
mkdir -p "$DIR"
chmod 700 "$DIR"
mkdir -p "$ROOT/backups"

random() { openssl rand -base64 36 | tr -d '\n/+=' | cut -c1-40; }

write_once() {
  name="$1"; value="$2"
  if [ -f "$DIR/$name.txt" ]; then
    echo "kept   secrets/$name.txt (already exists)"
  else
    printf '%s' "$value" > "$DIR/$name.txt"
    chmod 644 "$DIR/$name.txt"
    echo "wrote  secrets/$name.txt"
  fi
}

[ -f "$DIR/postgres_owner_password.txt" ] || write_once postgres_owner_password "$(random)"
[ -f "$DIR/diary_app_password.txt" ] || write_once diary_app_password "$(random)"
[ -f "$DIR/diary_backup_password.txt" ] || write_once diary_backup_password "$(random)"

OWNER_PW="$(cat "$DIR/postgres_owner_password.txt")"
APP_PW="$(cat "$DIR/diary_app_password.txt")"
BACKUP_PW="$(cat "$DIR/diary_backup_password.txt")"

# Passwords above are URL-safe, so they can be embedded in connection strings unescaped.
write_once database_owner_url "postgres://diary_owner:$OWNER_PW@postgres:5432/diary?sslmode=disable"
write_once database_app_url "postgres://diary_app:$APP_PW@postgres:5432/diary?sslmode=disable"
write_once code_hmac_secret "$(openssl rand -base64 48 | tr -d '\n')"

if [ -n "${RESEND_API_KEY:-}" ]; then
  write_once resend_api_key "$RESEND_API_KEY"
elif [ ! -f "$DIR/resend_api_key.txt" ]; then
  printf '' > "$DIR/resend_api_key.txt"
  echo "EMPTY  secrets/resend_api_key.txt: paste your Resend API key there"
fi

echo "done. Secrets are in $DIR (ignored by git)."
