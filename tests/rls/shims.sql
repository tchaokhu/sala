-- Stand-ins for the parts of Supabase that a plain Postgres does not have.
-- Applied by scripts/db-reset.mjs before the migrations, because Postgres
-- validates SQL function bodies at CREATE time and is_member() calls auth.uid().
--
-- These exist so the schema-shape tests can run without a Supabase project.
-- They are test infrastructure and never ship: nothing in supabase/migrations/
-- may depend on anything defined here.

CREATE SCHEMA IF NOT EXISTS auth;

-- On Supabase this reads the JWT claim. Locally it reads a session setting, so
-- a test can say "now act as this user".
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- The roles Supabase provides. Policies are written `TO authenticated` / `TO
-- anon`, which fails to parse if the roles are missing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

-- Table-level grants Supabase hands its API roles. RLS decides which rows a role
-- sees; these decide whether the role may touch the table at all — without them
-- `authenticated` gets "permission denied for table", not the zero rows RLS
-- intends. Supabase grants these to anon and authenticated on the public schema;
-- here we grant only authenticated (anon reaches nothing directly — its one
-- write path is the SECURITY DEFINER intake function) so a test can act as a
-- signed-in user and let RLS do the filtering. Default privileges apply to the
-- migration tables created after this file runs.
GRANT USAGE ON SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- Supabase also hands anon the same table privileges, on every table in public,
-- by default. RLS is what actually stops it — there is no policy naming anon,
-- so the grants buy it nothing — but a privilege that exists only because
-- nobody removed it is one policy mistake away from mattering. Mirrored here
-- so that 0004's REVOKE has something to remove and the shape test's assertion
-- is not vacuous. anon keeps USAGE on the schema: it needs it to reach
-- create_inquiry_via_token(), which is SECURITY DEFINER and its only way in.
GRANT USAGE ON SCHEMA public TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon;
