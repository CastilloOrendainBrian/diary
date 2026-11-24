-- Extensions required by the schema.
-- citext: case-insensitive email addresses.
-- pgcrypto: cryptographic helpers (kept for future use; gen_random_uuid() is built in on PG 13+).
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
