-- When a room let by another agent is expected back (ADR 0016), and the
-- thirteen Cozy Keys rooms that were `rented` with no Rental behind them.

-- Optional; nothing acts on it. It means something only while the room is let
-- elsewhere, so it exists only then.
ALTER TABLE properties
  ADD COLUMN free_on date,
  ADD CONSTRAINT properties_free_on_let_elsewhere
    CHECK (free_on IS NULL OR status = 'let_elsewhere');

-- Moving the status off `let_elsewhere` takes the date with it, whoever writes
-- the row — the Property form, or create_rental setting `rented`.
CREATE FUNCTION clear_free_on() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'let_elsewhere' THEN
    NEW.free_on := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- A trigger function is fired, not called: nobody needs EXECUTE on it, and
-- Supabase's default grants would otherwise hand it to anon (CLAUDE.md).
REVOKE ALL ON FUNCTION clear_free_on() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER properties_clear_free_on
  BEFORE INSERT OR UPDATE OF status, free_on ON properties
  FOR EACH ROW EXECUTE FUNCTION clear_free_on();

-- `rented` means an active Rental of ours exists (ADR 0009); these have none.
UPDATE properties p
   SET status = 'let_elsewhere'
 WHERE p.status = 'rented'
   AND NOT EXISTS (
     SELECT 1 FROM rentals r WHERE r.property_id = p.id AND r.status = 'active'
   );

-- The tiles above the Properties list count the new status too. The return
-- type changes, so drop and recreate — and re-revoke, as 0013 explains.
DROP FUNCTION IF EXISTS org_property_counts(uuid);

CREATE FUNCTION org_property_counts(p_org uuid)
RETURNS TABLE (
  total           integer,
  available       integer,
  reserved        integer,
  rented          integer,
  let_elsewhere   integer,
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
    count(*) FILTER (WHERE p.status = 'let_elsewhere')::integer,
    count(*) FILTER (
      WHERE p.status = 'available'
        AND NOT EXISTS (SELECT 1 FROM postings po WHERE po.property_id = p.id)
    )::integer
  FROM properties p
  WHERE p.org_id = p_org
$$;

REVOKE ALL ON FUNCTION org_property_counts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION org_property_counts(uuid) TO authenticated;
