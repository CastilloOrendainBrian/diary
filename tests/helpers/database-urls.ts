import { fileURLToPath } from "node:url";

// Development defaults match docker-compose.dev.yml. Override with environment variables in CI.
const DEV_HOST = "127.0.0.1:5433";

export const TEST_ADMIN_URL =
  process.env.TEST_ADMIN_DATABASE_URL ??
  `postgres://diary_owner:diary_dev_password@${DEV_HOST}/diary`;

export const TEST_OWNER_URL =
  process.env.TEST_OWNER_DATABASE_URL ??
  `postgres://diary_owner:diary_dev_password@${DEV_HOST}/diary_test`;

export const TEST_APP_URL =
  process.env.TEST_APP_DATABASE_URL ??
  `postgres://diary_app:diary_app_dev_password@${DEV_HOST}/diary_test`;

export const TEST_BACKUP_URL =
  process.env.TEST_BACKUP_DATABASE_URL ??
  `postgres://diary_backup:diary_backup_dev_password@${DEV_HOST}/diary_test`;

export const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../src/server/db/migrations", import.meta.url),
);

export const GRANTS_SQL_PATH = fileURLToPath(
  new URL("../../deploy/postgres/grant-privileges.sql", import.meta.url),
);

export const TEST_DATABASE_NAME = "diary_test";
