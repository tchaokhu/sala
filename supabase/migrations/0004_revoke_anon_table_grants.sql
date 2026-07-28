-- Take away the table privileges Supabase hands the anon role by default.
--
-- Supabase grants anon SELECT, INSERT, UPDATE and DELETE on everything in
-- public, and sets default privileges so future tables get them too. On a fresh
-- Sala project that is 33 grants nobody asked for. They are inert today: RLS is
-- enabled everywhere and no policy names anon, so an anonymous request reads
-- zero rows and its writes are refused by the policy check, which was verified
-- against the real project before this migration was written.
--
-- Inert is not the same as absent. The grant is the second half of every RLS
-- accident: the day a permissive policy is added for some public listing page,
-- how far that mistake reaches is decided by whether anon holds a privilege on
-- the table. Cozy Keys' open INSERT on inquiries is what that looks like when
-- both halves line up. Removing the grant means the mistake has to be made
-- twice.
--
-- What anon keeps: USAGE on the schema and EXECUTE on
-- create_inquiry_via_token(). That function is SECURITY DEFINER, so it inserts
-- as its owner and needs no table privilege from its caller. The intake path
-- (ADR 0002) is unaffected — proven by tests/rls/inquiry-intake.test.ts.
--
-- tests/rls/schema-shape.test.ts asserts the result, and tests/rls/shims.sql
-- mirrors Supabase's defaults so that assertion is not vacuous against the
-- local Postgres.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- The grants above are re-created for every table added later unless the
-- default itself is revoked. Default privileges attach to the role that
-- *creates* the object, so this covers exactly the tables future migrations
-- will add — they run as this same role. Verified against the real project by
-- creating a table and reading its grants back: zero for anon, where before
-- this migration it would have inherited four.
--
-- Supabase keeps a second set of defaults owned by supabase_admin, which
-- `postgres` may not alter ("permission denied to change default privileges").
-- Those only apply to objects supabase_admin itself creates, which no migration
-- in this repo does. If a table is ever added through the dashboard rather than
-- a migration, check its grants — and then move it into a migration, because
-- all schema lives in supabase/migrations (CLAUDE.md).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
