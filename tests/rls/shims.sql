-- Stand-ins for the parts of Supabase that a plain Postgres does not have.
-- Applied by scripts/db-reset.mjs before the migrations, because Postgres
-- validates SQL function bodies at CREATE time and is_member() calls auth.uid().
--
-- These exist so the schema-shape tests can run without a Supabase project. They
-- are test infrastructure and never ship. Everything here is a *stand-in for
-- something Supabase really provides* — auth.uid(), auth.users, the three API
-- roles, the default table grants — and a migration may lean on those the way it
-- leans on Postgres itself. What a migration may never do is depend on something
-- that exists only in this file: if it is not on a real Supabase project, it does
-- not belong in supabase/migrations/.

CREATE SCHEMA IF NOT EXISTS auth;

-- On Supabase this reads the JWT claim. Locally it reads a session setting, so
-- a test can say "now act as this user".
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- GoTrue's user table, reduced to the two columns anything in this repo reads.
-- org_members() joins it for the email, so it has to exist at CREATE time for
-- the same reason auth.uid() does. Dropped and rebuilt rather than created if
-- missing: db-reset.mjs drops only `public`, so a surviving table would carry
-- the previous run's users into the next one's assertions.
DROP TABLE IF EXISTS auth.users CASCADE;
CREATE TABLE auth.users (
  id     uuid PRIMARY KEY,
  email  varchar(255) UNIQUE
);

-- The roles Supabase provides. Policies are written `TO authenticated` / `TO
-- anon`, which fails to parse if the roles are missing. service_role is the one
-- the Superadmin console holds (ADR 0006); BYPASSRLS is what makes it behave
-- here the way it does on Supabase, so a test that grants it too much fails
-- locally instead of in production.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

-- Supabase gives service_role full privileges on public and lets it bypass RLS —
-- it is the key that ADR 0001's isolation is written against, which is the whole
-- reason ADR 0006 bounds where it may be used. Mirrored here so the console's
-- reads behave locally as they do on the project; a test that passed only
-- because the local role was weaker than the real one would prove nothing.
GRANT USAGE ON SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;

-- auth.users stays out of reach even for service_role: the console reads it
-- through SECURITY DEFINER functions, matching Supabase, where that table is
-- behind GoTrue's admin API rather than PostgREST.

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

-- And on FUNCTIONS, which is the one that got away. Supabase grants EXECUTE on
-- every function created in `public` to all three API roles by default, so
-- `REVOKE ALL ON FUNCTION f FROM public` in a migration does *not* leave the
-- function unreachable — PUBLIC and `anon` are different grantees. 0006 was
-- written believing otherwise and shipped a DEFINER function anon could call;
-- 0007 corrects it. Mirrored here so that mistake fails locally, where it is
-- cheap, instead of on the project, where it was live.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

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
