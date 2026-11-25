-- pg_dump also reads sequence values (serial and identity columns), so the backup role needs
-- SELECT on sequences in every schema it dumps.
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO diary_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA drizzle TO diary_backup;
