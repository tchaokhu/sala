-- Display Names on Memberships, and the reads the member lists need.
--
-- See docs/adr/0006-superadmin-console-and-the-service-role.md.
--
-- Four functions, three of them SECURITY DEFINER, and the reason is the same in
-- each case: `auth.users` is not in the PostgREST schema and must not be, so a
-- list that shows email addresses cannot be an ordinary SELECT. Where ADR 0005's
-- aggregates could be INVOKER and let RLS do the filtering, these cannot — the
-- join reaches a table the caller has no privilege on at all. So each one names
-- its own guard, and the guard is the first thing in the body.

-- ─── Display Name ────────────────────────────────────────────────────────────
-- On the Membership, not on the person: a per-person profile table in `public`
-- would need org_id NOT NULL to satisfy the shape test, and a name that lives
-- inside the Org boundary is the better answer anyway. NULL means "not set" and
-- the UI falls back to the login email; the CHECK forbids the whitespace-only
-- string that would render as a blank cell instead.
ALTER TABLE memberships
  ADD COLUMN display_name text
    CHECK (display_name IS NULL OR length(btrim(display_name)) BETWEEN 1 AND 80);

-- ─── The member list, for Members ────────────────────────────────────────────
-- DEFINER, so the guard has to be explicit. `(SELECT is_member(...))` for the
-- same reason the policies use that form: an InitPlan evaluated once, not a call
-- per row. A non-member gets zero rows rather than an exception — the same
-- non-disclosure NotAMemberError uses, one step down.
CREATE OR REPLACE FUNCTION org_members(p_org uuid)
RETURNS TABLE (
  user_id       uuid,
  email         text,
  display_name  text,
  role          org_role,
  created_at    timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT m.user_id, u.email::text, m.display_name, m.role, m.created_at
    FROM memberships m
    JOIN auth.users u ON u.id = m.user_id
   WHERE m.org_id = p_org
     AND (SELECT is_member(p_org))
   ORDER BY m.created_at, m.user_id
$$;

REVOKE ALL ON FUNCTION org_members(uuid) FROM public;
GRANT EXECUTE ON FUNCTION org_members(uuid) TO authenticated;

-- ─── Renaming yourself ───────────────────────────────────────────────────────
-- A function rather than a policy, and this is the whole reason it exists: RLS
-- decides rows, not columns. A policy permitting `user_id = auth.uid()` to
-- UPDATE its own Membership row would permit that row's `role` column too, and
-- every member could make themselves an owner. This writes one column.
CREATE OR REPLACE FUNCTION set_my_display_name(p_org uuid, p_name text)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Blank clears the name and falls back to the email, rather than storing a
  -- string that looks like a name and renders as nothing.
  v_name text := NULLIF(btrim(p_name), '');
BEGIN
  IF v_name IS NOT NULL AND length(v_name) > 80 THEN
    RAISE EXCEPTION 'display name is longer than 80 characters';
  END IF;

  UPDATE memberships
     SET display_name = v_name
   WHERE org_id = p_org AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not a member of this org';
  END IF;

  RETURN v_name;
END $$;

REVOKE ALL ON FUNCTION set_my_display_name(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION set_my_display_name(uuid, text) TO authenticated;

-- ─── The Superadmin console's two reads ──────────────────────────────────────
-- Granted to service_role and to nothing else. A Superadmin holds no Membership,
-- so is_member() refuses them everywhere and org_members above returns them
-- nothing — which is correct, and is why the console needs its own pair.
--
-- These are the only Superadmin reads there are. Orgs and Memberships, per
-- ADR 0006; there is deliberately no admin_properties, no admin_payments and no
-- admin_tenants, and adding one is a new ADR rather than a new function here.

CREATE OR REPLACE FUNCTION admin_org_members(p_org uuid)
RETURNS TABLE (
  user_id       uuid,
  email         text,
  display_name  text,
  role          org_role,
  created_at    timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT m.user_id, u.email::text, m.display_name, m.role, m.created_at
    FROM memberships m
    JOIN auth.users u ON u.id = m.user_id
   WHERE m.org_id = p_org
   ORDER BY m.created_at, m.user_id
$$;

REVOKE ALL ON FUNCTION admin_org_members(uuid) FROM public;
GRANT EXECUTE ON FUNCTION admin_org_members(uuid) TO service_role;

-- Adding somebody starts by asking whether they already have an account. GoTrue's
-- admin API can only answer that by listing users a page at a time and filtering
-- in JavaScript, which is the "download the table to compute one thing" shape
-- CLAUDE.md is about — and it gets slower as Sala grows. This is one indexed
-- lookup. Case-insensitive because GoTrue stores addresses lowercased and an
-- operator will type them however they were written down.
CREATE OR REPLACE FUNCTION admin_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(btrim(p_email)) LIMIT 1
$$;

REVOKE ALL ON FUNCTION admin_user_id_by_email(text) FROM public;
GRANT EXECUTE ON FUNCTION admin_user_id_by_email(text) TO service_role;

-- Demoting or removing the last owner leaves an Org that no Member can
-- administer, and only a Superadmin could then repair. Counted in SQL so the
-- check reads the same number the constraint is about, in the same statement it
-- is about to act on.
CREATE OR REPLACE FUNCTION admin_owner_count(p_org uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer FROM memberships WHERE org_id = p_org AND role = 'owner'
$$;

REVOKE ALL ON FUNCTION admin_owner_count(uuid) FROM public;
GRANT EXECUTE ON FUNCTION admin_owner_count(uuid) TO service_role;

-- The console's landing list. Counting Memberships in SQL rather than fetching
-- them to length() in JavaScript, and bounded like every other list — Orgs grow
-- one invited agency at a time (ADR 0001), which is a reason the first page is
-- usually the only page, not a reason to leave the query unbounded.
CREATE OR REPLACE FUNCTION admin_orgs(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id            uuid,
  slug          text,
  name          text,
  member_count  integer,
  owner_count   integer,
  created_at    timestamptz,
  total         integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.slug, o.name,
         count(m.user_id)::integer,
         count(m.user_id) FILTER (WHERE m.role = 'owner')::integer,
         o.created_at,
         -- The unbounded total, so the console can say "showing 50 of 63"
         -- instead of quietly ending the list.
         (SELECT count(*)::integer FROM orgs)
    FROM orgs o
    LEFT JOIN memberships m ON m.org_id = o.id
   GROUP BY o.id, o.slug, o.name, o.created_at
   ORDER BY o.created_at, o.id
   LIMIT least(greatest(p_limit, 1), 200)
$$;

REVOKE ALL ON FUNCTION admin_orgs(integer) FROM public;
GRANT EXECUTE ON FUNCTION admin_orgs(integer) TO service_role;
