-- The counts above the Property table: one row, one trip, four aggregates.
--
-- Same shape and the same reasoning as org_dashboard (ADR 0005). SECURITY
-- INVOKER, so RLS filters it and a non-member gets zeros rather than another
-- agency's inventory. The list underneath is an ordinary bounded SELECT with a
-- cursor — only the aggregate goes through a function, because only the
-- aggregate cannot be expressed as one.
--
-- FILTER rather than three separate scans: the planner reads properties once
-- and buckets as it goes, and properties_org_status_idx covers the filter.

CREATE OR REPLACE FUNCTION org_property_counts(p_org uuid)
RETURNS TABLE (
  total      integer,
  available  integer,
  reserved   integer,
  rented     integer
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE status = 'available')::integer,
    count(*) FILTER (WHERE status = 'reserved')::integer,
    count(*) FILTER (WHERE status = 'rented')::integer
  FROM properties
  WHERE org_id = p_org
$$;

REVOKE ALL ON FUNCTION org_property_counts(uuid) FROM public;
GRANT EXECUTE ON FUNCTION org_property_counts(uuid) TO authenticated;

-- The list's keyset order: newest first, id breaking ties. The tie-break is not
-- decoration — the Cozy Keys ETL will insert thousands of rows inside one
-- transaction, giving them all the same created_at, and a cursor on the
-- timestamp alone would skip or repeat rows at every page boundary.
CREATE INDEX properties_org_created_idx ON properties (org_id, created_at DESC, id DESC);
