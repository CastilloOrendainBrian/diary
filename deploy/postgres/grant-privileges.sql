-- Grants for the application roles on the CURRENT database.
-- Executed by deploy/postgres/init-roles.sh for every database that needs them.
--
-- Roles:
--   diary_owner  owns the schema and runs migrations (not a runtime role)
--   diary_app    runtime role used by the API (DML only, no DDL)
--   diary_backup read-only role used by pg_dump

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO diary_app, diary_backup', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO diary_app, diary_backup;

-- Objects created later by diary_owner (migrations) get these privileges automatically.
ALTER DEFAULT PRIVILEGES FOR ROLE diary_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO diary_app;
ALTER DEFAULT PRIVILEGES FOR ROLE diary_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO diary_app;
ALTER DEFAULT PRIVILEGES FOR ROLE diary_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO diary_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE diary_owner IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO diary_backup;

-- Objects that already exist (for example when the database is reset in tests).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO diary_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO diary_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO diary_backup;
