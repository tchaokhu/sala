-- The `owner` Role becomes `admin`, and an Org gains a life cycle.
--
-- See docs/adr/0010-superadmin-gains-org-lifecycle-owner-becomes-admin.md.
--
-- Two changes that arrived as one request. The rename is not a new capability:
-- `admin` keeps exactly `owner`'s two powers — invite/remove Members, edit the
-- Org — and `member` is untouched. It happens because CONTEXT.md's real-estate
-- **Owner** (the person whose Property an Org lets) already carried a footnote
-- disambiguating itself from the `owner` Role. Two unrelated concepts were
-- sharing one word; removing the collision removes the need for the footnote.
--
-- The life cycle is soft-delete with a 60-day recovery window. Unlike Property
-- (ADR 0009), which is ON DELETE RESTRICT: an Org carries at least one
-- Membership from the moment it exists, so a "delete only when nothing points
-- at it" rule would make Org deletion permanently unusable rather than a
-- hurdle to clear.

-- ─── The Role ────────────────────────────────────────────────────────────────
-- RENAME VALUE rewrites the label in place, so every existing row keeps the
-- Role it had — there is no data migration here, and no window in which a
-- Membership holds a value the enum does not have.

ALTER TYPE org_role RENAME VALUE 'owner' TO 'admin';

-- A `LANGUAGE sql` body is stored as text and parsed when it runs, so the
-- helper below would not fail at rename time — it would fail on the next call,
-- with "invalid input value for enum org_role". Replaced rather than left to
-- discover.
--
-- Renamed with ALTER FUNCTION rather than DROP + CREATE because four policies
-- reference it by OID; dropping it would need every one of them dropped and
-- rebuilt, and a rebuilt policy is a policy that can come back subtly
-- different. The rename keeps the OID, so the policies follow it and
-- pg_policies renders the new name.
ALTER FUNCTION is_org_owner(uuid) RENAME TO is_org_admin;

CREATE OR REPLACE FUNCTION is_org_admin(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- Delegating the "is this Org still alive" question to is_member() rather
  -- than repeating its NOT EXISTS clause here: an admin is a Member with one
  -- extra power, and two copies of the soft-delete rule is one place for them
  -- to drift apart. Without this, an admin of a soft-deleted Org would still
  -- satisfy memberships_admin_insert/update/delete and could go on adding and
  -- removing people inside an Org nobody can see.
  SELECT (SELECT is_member(p_org))
     AND EXISTS (
       SELECT 1 FROM memberships
       WHERE org_id = p_org AND user_id = auth.uid() AND role = 'admin'
     )
$$;

-- Dropped and rebuilt rather than ALTER POLICY ... RENAME TO. A rename keeps
-- the stored expression, and that expression carries the output column alias
-- Postgres froze at CREATE time — so `memberships_admin_insert` would read
-- back from pg_policies as `(SELECT is_org_admin(org_id) AS is_org_owner)`.
-- Cosmetic to the planner, a false trail to anyone grepping the catalog for
-- the old name. The bodies below are 0001's, unchanged but for the name.
DROP POLICY orgs_owner_update        ON orgs;
DROP POLICY memberships_owner_insert ON memberships;
DROP POLICY memberships_owner_update ON memberships;
DROP POLICY memberships_owner_delete ON memberships;

CREATE POLICY orgs_admin_update ON orgs
  FOR UPDATE TO authenticated
  USING ((SELECT is_org_admin(id))) WITH CHECK ((SELECT is_org_admin(id)));

CREATE POLICY memberships_admin_insert ON memberships
  FOR INSERT TO authenticated WITH CHECK ((SELECT is_org_admin(org_id)));
CREATE POLICY memberships_admin_update ON memberships
  FOR UPDATE TO authenticated
  USING ((SELECT is_org_admin(org_id))) WITH CHECK ((SELECT is_org_admin(org_id)));
CREATE POLICY memberships_admin_delete ON memberships
  FOR DELETE TO authenticated USING ((SELECT is_org_admin(org_id)));

-- ─── Soft deletion ───────────────────────────────────────────────────────────

ALTER TABLE orgs ADD COLUMN deleted_at timestamptz;

-- Partial: the column is NULL for every Org that matters, and the only query
-- that reads it looks for the handful where it is not — the purge script's
-- `deleted_at < now() - interval '60 days'`.
CREATE INDEX orgs_deleted_idx ON orgs (deleted_at) WHERE deleted_at IS NOT NULL;

-- The single choke point. Every org-scoped table's generic policy calls
-- `(SELECT is_member(org_id))` and `orgs_member_read` calls `(SELECT
-- is_member(id))` for the Org's own row, so one clause here cuts a
-- soft-deleted Org off from every table at once — no per-policy edits, and no
-- grace-period read-only mode to keep correct in parallel with the real one.
--
-- The visible consequence is that requireMember starts raising NotAMemberError
-- for a soft-deleted Org exactly as it would for an Org the caller never
-- belonged to. That is the intended shape: one refusal, one code path.
CREATE OR REPLACE FUNCTION is_member(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE org_id = p_org AND user_id = auth.uid()
  )
  AND NOT EXISTS (
    SELECT 1 FROM orgs
    WHERE id = p_org AND deleted_at IS NOT NULL
  )
$$;

-- RLS decides rows, not columns — the same limitation that made
-- set_my_display_name a function instead of a policy (0006). orgs_admin_update
-- lets an Org's admin write their own Org's row, and without this an admin
-- could set `deleted_at` on it and lock their whole agency out. They could not
-- undo it either: the moment the column is set, is_member() refuses them and
-- the row is no longer theirs to see, let alone update.
--
-- Column-level privileges are what Postgres has for this. `deleted_at`,
-- `created_at`, `updated_at` and `id` are not an Org's to write from a session
-- at all; removal and restore are Superadmin operations and reach the table
-- through the service role, which holds no column grant to lose.
REVOKE UPDATE ON orgs FROM authenticated;
GRANT UPDATE (slug, name, intake_token_hash) ON orgs TO authenticated;

-- ─── The console's reads, renamed alongside the Role ─────────────────────────
-- DROP + CREATE rather than ALTER ... RENAME for these two: admin_orgs changes
-- its RETURNS TABLE, which CREATE OR REPLACE refuses, and nothing references
-- either by OID the way the policies reference is_org_admin. The privileges
-- that follow are therefore the *new* functions' privileges, restated in
-- 0007's form — see the note there for why `FROM public` is not enough.

DROP FUNCTION IF EXISTS admin_owner_count(uuid);

CREATE OR REPLACE FUNCTION admin_admin_count(p_org uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer FROM memberships WHERE org_id = p_org AND role = 'admin'
$$;

REVOKE ALL ON FUNCTION admin_admin_count(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_admin_count(uuid) TO service_role;

DROP FUNCTION IF EXISTS admin_orgs(integer);

CREATE OR REPLACE FUNCTION admin_orgs(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id            uuid,
  slug          text,
  name          text,
  member_count  integer,
  admin_count   integer,
  created_at    timestamptz,
  deleted_at    timestamptz,
  total         integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.slug, o.name,
         count(m.user_id)::integer,
         count(m.user_id) FILTER (WHERE m.role = 'admin')::integer,
         o.created_at,
         -- Carried on the same row rather than left to a second query: the
         -- console splits the list into active Orgs and ones pending deletion,
         -- and that is a rendering decision, not a round-trip.
         o.deleted_at,
         (SELECT count(*)::integer FROM orgs)
    FROM orgs o
    LEFT JOIN memberships m ON m.org_id = o.id
   GROUP BY o.id, o.slug, o.name, o.created_at, o.deleted_at
   ORDER BY o.created_at, o.id
   LIMIT least(greatest(p_limit, 1), 200)
$$;

REVOKE ALL ON FUNCTION admin_orgs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_orgs(integer) TO service_role;

-- is_member and is_org_admin were replaced in place, which preserves the
-- privileges 0007 set. Restated anyway, because "the privilege survived a
-- CREATE OR REPLACE" is exactly the kind of thing 0006 assumed and was wrong
-- about. tests/rls/schema-shape.test.ts reads the catalog, not this file.
REVOKE ALL ON FUNCTION is_member(uuid)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION is_org_admin(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION is_member(uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION is_org_admin(uuid) TO authenticated;

-- set_my_display_name (0006) is SECURITY DEFINER with its own WHERE clause, so
-- it never sat behind is_member() the way every RLS-policy-gated write does —
-- it is the one member-facing write is_org_admin's comment above warns about.
-- Without this, a Member locked out of every other door by is_member()'s new
-- soft-delete clause could still rename themselves inside an Org nobody else
-- can see. Checking is_member() first also makes the old NOT FOUND branch
-- redundant: membership existence is now proven before the UPDATE runs.
CREATE OR REPLACE FUNCTION set_my_display_name(p_org uuid, p_name text)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := NULLIF(btrim(p_name), '');
BEGIN
  IF NOT (SELECT is_member(p_org)) THEN
    RAISE EXCEPTION 'not a member of this org';
  END IF;

  IF v_name IS NOT NULL AND length(v_name) > 80 THEN
    RAISE EXCEPTION 'display name is longer than 80 characters';
  END IF;

  UPDATE memberships
     SET display_name = v_name
   WHERE org_id = p_org AND user_id = auth.uid();

  RETURN v_name;
END $$;

REVOKE ALL ON FUNCTION set_my_display_name(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_my_display_name(uuid, text) TO authenticated;
