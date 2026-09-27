-- Payments follow the remainder, not the settled date.
--
-- 0001 requires `settled_date` and `settled_amount` together, so a Tenant who
-- pays ฿5,000 of ฿8,000 gets a settled date. Everything that asked "is this
-- still owed?" asked `settled_date IS NULL` — org_dashboard, both partial
-- indexes, the reminder script — so the ฿3,000 left stopped being overdue,
-- stopped being reminded about and left the index. getPaymentStatus already
-- called it `partial`; the SQL did not.
--
-- What is still owed is now a column. `outstanding > 0` is exactly
-- `settled_amount IS NULL OR settled_amount < amount`, but PostgREST cannot
-- compare two columns in a filter, so the Payments list could not otherwise
-- say it — and a list that filters one way while the counts above it filter
-- another is a chip whose number does not match its rows. One expression,
-- written once, read by the list, the functions, the indexes and the script.
-- Negative on an overpayment, which reads as nothing owed, as `outstanding()`
-- in lib/payments.ts has it.

ALTER TABLE payments
  ADD COLUMN outstanding numeric(12,2)
    GENERATED ALWAYS AS (amount - COALESCE(settled_amount, 0)) STORED;

COMMENT ON COLUMN payments.outstanding IS
  'What is still owed: amount less whatever is settled so far. A Payment is '
  'outstanding while this is above zero — partly settled ones included.';

-- ─── Indexes on the new predicate ────────────────────────────────────────────
-- Same columns as 0001 and 0015; only the predicate moves, so a partly settled
-- Payment stays in them until the last baht arrives.

DROP INDEX payments_unsettled_idx;
CREATE INDEX payments_unsettled_idx
  ON payments (org_id, due_date) WHERE outstanding > 0;

DROP INDEX payments_due_unsettled_idx;
CREATE INDEX payments_due_unsettled_idx
  ON payments (org_id, due_date, last_reminded_on) WHERE outstanding > 0;

-- The list's keyset on (org_id, due_date, id) needs no index of its own:
-- payments_org_due_idx (0001) serves the order with an incremental sort on id,
-- and lib/payments-data.ts bounds due_date by the cursor so the index seeks to
-- the page rather than filtering past everything before it. A three-column
-- index was tried and does not do better — PostgREST's OR is a filter on
-- either — so it would only be a second copy of the same index to maintain.

-- ─── org_dashboard ───────────────────────────────────────────────────────────
-- 0017's function with the overdue figure on what is still owed, and a count
-- of late Deposit Refunds beside it. The two are never added together: one is
-- money owed in, the other money owed back out (0003), and netting them makes
-- a number that means nothing. Active Rentals still leaves out a room let by
-- another agent, exactly as 0017 has it.
--
-- The return type changes, so this drops and creates — and a created function
-- picks up Supabase's default EXECUTE for anon, which the REVOKE below takes
-- away again (0013, ADR 0006).

DROP FUNCTION IF EXISTS org_dashboard(uuid, date);

CREATE FUNCTION org_dashboard(p_org uuid, p_today date)
RETURNS TABLE (
  properties_total           integer,
  rentals_active             integer,
  rentals_ending_this_month  integer,
  overdue_amount             numeric,
  overdue_count              integer,
  refunds_late               integer
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM properties WHERE org_id = p_org)::integer,
    (SELECT count(*) FROM rentals
      WHERE org_id = p_org AND status = 'active'
        AND (rented_by_us OR rent_tracked_by_us))::integer,
    (SELECT count(*) FROM rentals
      WHERE org_id = p_org
        AND status = 'active'
        AND end_date >= date_trunc('month', p_today)::date
        AND end_date <  (date_trunc('month', p_today) + interval '1 month')::date)::integer,
    COALESCE((SELECT sum(outstanding) FROM payments
      WHERE org_id = p_org
        AND direction = 'in'
        AND outstanding > 0
        AND due_date < p_today), 0)::numeric,
    (SELECT count(*) FROM payments
      WHERE org_id = p_org
        AND direction = 'in'
        AND outstanding > 0
        AND due_date < p_today)::integer,
    (SELECT count(*) FROM payments
      WHERE org_id = p_org
        AND type = 'deposit_refund'
        AND outstanding > 0
        AND due_date < p_today)::integer
$$;

-- ─── org_payment_counts ──────────────────────────────────────────────────────
-- The chips above the Payments list, in one row (ADR 0005). Overdue is money
-- owed in; Refunds late is Deposit Refunds owed back — separate, never summed.
-- Due soon is today through a week from today, both directions, still owed.
-- Settled this month is settled in full with its last settlement dated inside
-- p_today's calendar month.

CREATE FUNCTION org_payment_counts(p_org uuid, p_today date)
RETURNS TABLE (
  overdue_count             integer,
  overdue_amount            numeric,
  refunds_late_count        integer,
  refunds_late_amount       numeric,
  due_soon_count            integer,
  settled_this_month_count  integer
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  -- One aggregate per chip rather than one pass with FILTERs: each of these
  -- reads its own index, where a single pass reads every Payment the Org has
  -- ever had, settled years included.
  SELECT o.n, o.amount, r.n, r.amount, d.n, s.n
  FROM
    (SELECT count(*)::integer AS n, COALESCE(sum(outstanding), 0)::numeric AS amount
       FROM payments
      WHERE org_id = p_org AND direction = 'in' AND outstanding > 0 AND due_date < p_today) o,
    (SELECT count(*)::integer AS n, COALESCE(sum(outstanding), 0)::numeric AS amount
       FROM payments
      WHERE org_id = p_org AND type = 'deposit_refund' AND outstanding > 0 AND due_date < p_today) r,
    (SELECT count(*)::integer AS n
       FROM payments
      WHERE org_id = p_org AND outstanding > 0
        AND due_date >= p_today AND due_date <= p_today + 7) d,
    (SELECT count(*)::integer AS n
       FROM payments
      WHERE org_id = p_org AND outstanding <= 0
        AND settled_date >= date_trunc('month', p_today)::date
        AND settled_date <  (date_trunc('month', p_today) + interval '1 month')::date) s
$$;

-- Settled this month filters on settled_date, which nothing indexed until now.
CREATE INDEX payments_org_settled_idx
  ON payments (org_id, settled_date) WHERE settled_date IS NOT NULL;

-- ─── Grants ──────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION org_dashboard(uuid, date)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION org_payment_counts(uuid, date) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION org_dashboard(uuid, date)      TO authenticated;
GRANT EXECUTE ON FUNCTION org_payment_counts(uuid, date) TO authenticated;
