-- A fifth count above the Property table: rooms nobody is marketing.
--
-- Extends org_property_counts (0005) rather than adding a second function, so
-- the tiles above the list stay one round trip. Only `available` rooms count:
-- a room that is already let does not need advertising, and counting it here
-- would make the number something a person has to mentally subtract from.
--
-- CREATE OR REPLACE cannot change a function's return type, so this drops and
-- recreates. That matters for one reason beyond the syntax: a newly created
-- function in `public` picks up Supabase's default EXECUTE grants to anon,
-- authenticated and service_role, so the REVOKE below is not ceremony left over
-- from 0005 — without it this migration would hand `anon` an Org's counts.
-- `FROM PUBLIC` alone would not do it either: PUBLIC and anon are different
-- grantees (CLAUDE.md, ADR 0006, 0007).

DROP FUNCTION IF EXISTS org_property_counts(uuid);

CREATE FUNCTION org_property_counts(p_org uuid)
RETURNS TABLE (
  total           integer,
  available       integer,
  reserved        integer,
  rented          integer,
  posted_nowhere  integer
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE p.status = 'available')::integer,
    count(*) FILTER (WHERE p.status = 'reserved')::integer,
    count(*) FILTER (WHERE p.status = 'rented')::integer,
    count(*) FILTER (
      WHERE p.status = 'available'
        AND NOT EXISTS (SELECT 1 FROM postings po WHERE po.property_id = p.id)
    )::integer
  FROM properties p
  WHERE p.org_id = p_org
$$;

REVOKE ALL ON FUNCTION org_property_counts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION org_property_counts(uuid) TO authenticated;
