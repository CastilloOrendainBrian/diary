-- The backup role must be able to dump the migration journal (drizzle schema), so a restored
-- database knows which migrations were already applied. Created here because the drizzle schema
-- only exists after the first migration run; deploy/postgres/grant-privileges.sql runs earlier.
GRANT USAGE ON SCHEMA drizzle TO diary_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO diary_backup;
