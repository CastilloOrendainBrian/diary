-- Least privilege for the runtime role (diary_app).
--
-- Tables created by the owner role (diary_owner) grant SELECT, INSERT, UPDATE and DELETE to
-- diary_app through ALTER DEFAULT PRIVILEGES (see deploy/postgres/grant-privileges.sql).
-- This migration removes the grants that the application must not have:
--   * audit_log is append-only for the application.
--   * login_codes rows are never deleted by the application; the purge job runs as diary_owner.
--
-- Requires the roles created by deploy/postgres/init-roles.sh.
REVOKE UPDATE, DELETE ON "audit_log" FROM diary_app;
REVOKE DELETE ON "login_codes" FROM diary_app;
