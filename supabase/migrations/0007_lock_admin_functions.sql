-- Close a hole 0006 opened on the real project.
--
-- 0006 said `REVOKE ALL ON FUNCTION ... FROM public` and then granted EXECUTE to
-- service_role, believing that left the admin_* functions reachable by nothing
-- else. It did not. Supabase ships
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
--
-- so every function created in `public` arrives with EXECUTE already held by
-- `anon` and `authenticated` *as roles*. REVOKE ... FROM public only drops the
-- PUBLIC pseudo-role's grant, which is a different thing with a confusingly
-- similar name, and the role grants survived it.
--
-- The consequence was live for the time between the two migrations:
-- admin_org_members is SECURITY DEFINER and carries no guard of its own — the
-- grant *was* the guard — so anyone holding the publishable anon key could have
-- called it through PostgREST for any Org id and read that Org's member list and
-- email addresses. admin_user_id_by_email would likewise answer "does this
-- address have an account", for any address.
--
-- The local shims did not reproduce Supabase's default privileges on FUNCTIONS,
-- so tests/rls/member-admin.test.ts passed against a database where the grant
-- genuinely was absent. Both are fixed: the shims now mirror the defaults, and
-- schema-shape.test.ts asserts the resulting privileges from the catalog rather
-- than inferring them from the SQL that was meant to produce them.

-- The console's reads. service_role and nobody else — a Superadmin is the only
-- caller, and it holds no Membership for a policy to check (ADR 0006).
REVOKE ALL ON FUNCTION admin_org_members(uuid)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_orgs(integer)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_owner_count(uuid)      FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION admin_org_members(uuid)      TO service_role;
GRANT EXECUTE ON FUNCTION admin_orgs(integer)          TO service_role;
GRANT EXECUTE ON FUNCTION admin_user_id_by_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION admin_owner_count(uuid)      TO service_role;

-- The member-facing pair do guard themselves — org_members on is_member, and
-- set_my_display_name on auth.uid() — so anon reaching them returns nothing and
-- raises respectively. Revoked anyway: a signed-out caller has no business
-- calling either, and leaving the grant means the guard is the only thing
-- standing between anon and a DEFINER function that joins auth.users.
REVOKE ALL ON FUNCTION org_members(uuid)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION set_my_display_name(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION org_members(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION set_my_display_name(uuid, text) TO authenticated;

-- Same correction for everything 0001–0005 created. None of these was exposed in
-- the way admin_* was: the two aggregates are SECURITY INVOKER, so RLS filters
-- them whoever calls; the membership helpers read auth.uid() and answer false
-- for a caller who has none. But they were all written expecting
-- `REVOKE ... FROM public` to mean what it does not, so the intent is restated
-- here in the form that works.
REVOKE ALL ON FUNCTION org_dashboard(uuid, date)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION org_property_counts(uuid)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION is_member(uuid)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION is_org_owner(uuid)          FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION org_dashboard(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION org_property_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_member(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION is_org_owner(uuid)        TO authenticated;

-- The updated_at trigger function. Postgres refuses to call a function returning
-- `trigger` directly, so the grant buys anon nothing — but it is a grant that
-- exists only because nobody removed it, which is the same reasoning 0004
-- applied to anon's table privileges. Revoked so the shape test's list can stay
-- exactly one name long.
REVOKE ALL ON FUNCTION touch_updated_at() FROM PUBLIC, anon, authenticated;

-- create_inquiry_via_token keeps anon deliberately: an Inquiry arrives from a bot
-- holding a secret and no session, and this SECURITY DEFINER function is the one
-- write path anon has (ADR 0002). It is the single allowlisted exception in the
-- shape test's new assertion.
