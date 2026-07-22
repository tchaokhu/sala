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
