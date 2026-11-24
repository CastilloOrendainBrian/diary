-- Row Level Security: a user can only read and modify their own diary data.
--
-- The application sets app.user_id inside every data transaction (see src/server/db/rls.ts).
-- nullif(...) makes an unset or empty setting match no rows instead of raising an error.
-- The table owner (diary_owner) bypasses the policies: it is the maintenance role. The runtime
-- role (diary_app) is subject to them, which is what isolates users at runtime.

ALTER TABLE "entries" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entries_owner" ON "entries"
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tags_owner" ON "tags"
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

-- entry_tags has no user column: visibility follows the entry, and the entries policy applies
-- inside the subquery.
ALTER TABLE "entry_tags" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entry_tags_owner" ON "entry_tags"
  USING (EXISTS (SELECT 1 FROM entries e WHERE e.id = entry_tags.entry_id))
  WITH CHECK (EXISTS (SELECT 1 FROM entries e WHERE e.id = entry_tags.entry_id));
