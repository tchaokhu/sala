-- The Org landing page's numbers, in one round-trip.
--
-- Four tiles, four aggregates, one statement. The alternative — four count
-- queries from the page, or worse, selecting the rows and reducing over them in
-- JavaScript — is the Cozy Keys dashboard, and it is why that dashboard feels
-- slow. Counts and sums are SQL (CLAUDE.md).
--
-- SECURITY INVOKER, deliberately, unlike the membership helpers above it: this
-- runs as the caller, so every subquery below is filtered by the same policies
-- a direct SELECT would hit. A non-member handing in a real Org id gets zeros,
-- not another agency's books — proven in tests/rls/dashboard.test.ts. A
-- DEFINER function here would be a hole into every Org, which is precisely what
-- ADR 0001 is built to prevent. The caller still establishes Membership first
-- (ADR 0002); this is the second lock, not the first.
--
-- `p_today` is a parameter rather than now(): the app anchors "today" to
-- Asia/Bangkok, and a server clock in UTC disagrees with it for seven hours of
-- every day. Passing the date in keeps one definition of today in the codebase
-- (lib/dates.ts) instead of two that drift.

CREATE OR REPLACE FUNCTION org_dashboard(p_org uuid, p_today date)
RETURNS TABLE (
  properties_total           integer,
  rentals_active             integer,
  rentals_ending_this_month  integer,
  overdue_amount             numeric,
  overdue_count              integer
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM properties WHERE org_id = p_org)::integer,
    (SELECT count(*) FROM rentals
      WHERE org_id = p_org AND status = 'active')::integer,
    -- The calendar month of p_today, not a rolling 30 days: the tile answers
    -- "what has to be dealt with before the month is out", so it must change on
    -- the 1st rather than slide. A Rental ending on the 31st is inside it.
    (SELECT count(*) FROM rentals
      WHERE org_id = p_org
        AND status = 'active'
        AND end_date >= date_trunc('month', p_today)::date
        AND end_date <  (date_trunc('month', p_today) + interval '1 month')::date)::integer,
    -- Money owed *to* the Org and past its due date. Direction matters: a
    -- deposit refund the Org has yet to hand back is also unsettled, but adding
    -- it here would net two opposite obligations into one meaningless number.
    -- Uses payments_unsettled_idx.
    COALESCE((SELECT sum(amount) FROM payments
      WHERE org_id = p_org
        AND direction = 'in'
        AND settled_date IS NULL
        AND due_date < p_today), 0)::numeric,
    (SELECT count(*) FROM payments
      WHERE org_id = p_org
        AND direction = 'in'
        AND settled_date IS NULL
        AND due_date < p_today)::integer
$$;

REVOKE ALL ON FUNCTION org_dashboard(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION org_dashboard(uuid, date) TO authenticated;

-- The ending-this-month count filters on org_id and orders on end_date within
-- one status. rentals_expiry_idx serves the nightly job, which sweeps every Org
-- at once; this one serves a single Org's page. Both are cheap and neither
-- covers the other's query.
CREATE INDEX rentals_org_expiry_idx ON rentals (org_id, end_date) WHERE status = 'active';
