-- Every Rental Document has a kind, and the Rentals list can find the Rentals
-- of ours that have no contract.
--
-- The three rows on the project when this was written are the ETL's, and all
-- three are signed rental contracts — hence the backfill. The default exists
-- only for that backfill: a Document uploaded afterwards names its kind or is
-- refused, so a forgotten field cannot quietly file an ID scan as a contract.
--
-- The list is short on purpose. Adding a value later is cheap; renaming or
-- removing one is not.

CREATE TYPE rental_document_kind AS ENUM (
  'contract', 'id_copy', 'transfer_slip', 'inspection', 'receipt', 'other'
);

ALTER TABLE rental_documents
  ADD COLUMN kind rental_document_kind NOT NULL DEFAULT 'contract';
ALTER TABLE rental_documents
  ALTER COLUMN kind DROP DEFAULT;

-- No new index. "Has this Rental a contract of its own" is a probe by
-- rental_id, which rental_documents_rental_idx (0001) already leads with, and
-- a Rental carries a handful of Documents, so `kind` is a filter over those
-- few rows. EXPLAIN of the NOT EXISTS below (300 Rentals, four Documents each)
-- probes rental_documents_rental_idx on rental_id and filters kind; a
-- (rental_id, kind) index would be a second copy of it.

-- ─── org_rental_counts ───────────────────────────────────────────────────────
-- 0017's function plus `no_contract`: active Rentals of the agency's own (not
-- let by another agent) with no `contract` Document attached to *that* Rental.
-- A renewal signs a new contract, so a predecessor's does not count.
--
-- The return type changes, so this is DROP and CREATE — which drops the grants
-- with it, and the new function picks up Supabase's default EXECUTE for anon.
-- Hence the REVOKE, as 0017 did it (CLAUDE.md, ADR 0006).

DROP FUNCTION org_rental_counts(uuid, date);

CREATE FUNCTION org_rental_counts(p_org uuid, p_today date)
RETURNS TABLE (
  active             integer,
  let_elsewhere      integer,
  ending_this_month  integer,
  past_end_date      integer,
  ended              integer,
  no_contract        integer
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    count(*) FILTER (WHERE r.status = 'active' AND (r.rented_by_us OR r.rent_tracked_by_us))::integer,
    count(*) FILTER (WHERE r.status = 'active' AND NOT r.rented_by_us AND NOT r.rent_tracked_by_us)::integer,
    count(*) FILTER (
      WHERE r.status = 'active'
        AND r.end_date >= date_trunc('month', p_today)::date
        AND r.end_date <  (date_trunc('month', p_today) + interval '1 month')::date
    )::integer,
    count(*) FILTER (WHERE r.status = 'active' AND r.end_date < p_today)::integer,
    count(*) FILTER (WHERE r.status = 'ended')::integer,
    count(*) FILTER (
      WHERE r.status = 'active'
        AND (r.rented_by_us OR r.rent_tracked_by_us)
        AND NOT EXISTS (
          SELECT 1 FROM rental_documents d
           WHERE d.rental_id = r.id AND d.org_id = r.org_id AND d.kind = 'contract'
        )
    )::integer
  FROM rentals r
  WHERE r.org_id = p_org
$$;

REVOKE ALL ON FUNCTION org_rental_counts(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION org_rental_counts(uuid, date) TO authenticated;
