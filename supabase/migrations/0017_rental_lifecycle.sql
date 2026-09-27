-- The Rental lifecycle: create, end, renew, delete — one function each.
--
-- Creating a Rental writes a Tenant (when new), the Rental, its whole Payment
-- schedule and its Property's status. Through PostgREST that is four
-- round-trips with no transaction between them, and a failure after the second
-- leaves a Rental with no schedule behind a Property that still reads
-- Available. A function body is one transaction. See
-- docs/adr/0014-one-invoker-function-per-rental-transition.md.
--
-- SECURITY INVOKER, all of them, for the reason 0003 gives (ADR 0005): every
-- statement below meets the caller's RLS policies, and the composite keys from
-- 0016 refuse a child naming another Org's parent. Nothing here checks
-- Membership itself, because nothing here needs to — hand these another Org's
-- id and the first write is refused. The Server Action still establishes
-- Membership first (ADR 0002); this is the second lock.
--
-- The schedule arrives as JSON from TypeScript (lib/payments.ts). It is ported,
-- tested, and previewed in the browser from the same function; a plpgsql copy
-- would be a second implementation to keep in step. The function stamps
-- org_id, rental_id and property_id itself, so the JSON cannot name them.
--
-- Refusals carry their own SQLSTATE so the action can turn them into a sentence
-- without reading Postgres text:
--   P0002  the Rental is not there, or not active, for this caller
--   SL001  delete refused: a Payment under it is settled
--   SL002  delete refused: a Rental Document is attached
--
-- Every function created here picks up Supabase's default EXECUTE grants to
-- anon, authenticated and service_role as roles; `FROM PUBLIC` alone does not
-- remove anon's (CLAUDE.md, ADR 0006). Hence the explicit REVOKE at the end.
--
-- "Let by another agent" is a Rental the agency had no hand in and follows no
-- money on: NOT rented_by_us AND NOT rent_tracked_by_us, with no column of its
-- own (ADR 0011, amended). It is recorded so the room comes back up as it
-- frees, which is why it counts in Ending this month but not in Active.

-- ─── create_rental ───────────────────────────────────────────────────────────

CREATE FUNCTION create_rental(
  p_org         uuid,
  p_property    uuid,
  p_tenant_id   uuid,
  p_new_tenant  jsonb,
  p_rental      jsonb,
  p_schedule    jsonb
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant  uuid := p_tenant_id;
  v_name    text;
  v_phone   text;
  v_rental  uuid;
BEGIN
  IF p_new_tenant IS NOT NULL THEN
    INSERT INTO tenants (org_id, name, phone, line_id, note)
    VALUES (
      p_org,
      btrim(p_new_tenant->>'name'),
      NULLIF(btrim(p_new_tenant->>'phone'), ''),
      NULLIF(btrim(p_new_tenant->>'line_id'), ''),
      NULLIF(btrim(p_new_tenant->>'note'), '')
    )
    RETURNING id, name, phone INTO v_tenant, v_name, v_phone;
  ELSIF v_tenant IS NOT NULL THEN
    -- Snapshotted from the row, never from the form: the name on a Rental is
    -- the Tenant's as the database has it. Another Org's Tenant is invisible
    -- here, so it reads as not found.
    SELECT name, phone INTO v_name, v_phone
      FROM tenants WHERE id = v_tenant AND org_id = p_org;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'tenant not found' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    -- Only a Rental let by another agent has no Tenant on file.
    IF (p_rental->>'rented_by_us')::boolean OR (p_rental->>'rent_tracked_by_us')::boolean THEN
      RAISE EXCEPTION 'a Rental of ours needs a Tenant';
    END IF;
    v_name := 'Let by another agent';
  END IF;

  INSERT INTO rentals (
    org_id, property_id, tenant_id, tenant_name_snapshot, tenant_phone_snapshot,
    start_date, end_date, monthly_rent, deposit, commission,
    rented_by_us, rent_tracked_by_us
  )
  VALUES (
    p_org, p_property, v_tenant, v_name, v_phone,
    (p_rental->>'start_date')::date,
    (p_rental->>'end_date')::date,
    (p_rental->>'monthly_rent')::numeric,
    (p_rental->>'deposit')::numeric,
    (p_rental->>'commission')::numeric,
    (p_rental->>'rented_by_us')::boolean,
    (p_rental->>'rent_tracked_by_us')::boolean
  )
  RETURNING id INTO v_rental;

  INSERT INTO payments (org_id, rental_id, property_id, direction, type, due_date, amount,
                        settled_date, settled_amount)
  SELECT p_org, v_rental, p_property, s.direction, s.type, s.due_date, s.amount,
         s.settled_date, s.settled_amount
    FROM jsonb_to_recordset(COALESCE(p_schedule, '[]'::jsonb)) AS s(
      direction payment_direction, type payment_type, due_date date, amount numeric,
      settled_date date, settled_amount numeric
    );

  UPDATE properties SET status = 'rented' WHERE id = p_property AND org_id = p_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'property not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_rental;
END;
$$;

-- ─── end_rental ──────────────────────────────────────────────────────────────
-- Deletes what `futureUnpaid` in lib/payments.ts counts — unsettled, due after
-- the end day — so the confirmation's number is the number that goes. Settled
-- Payments are never touched. `ended_at` is a timestamptz and the day the
-- tenancy ended is a Bangkok date, so it is stored as that day's Bangkok
-- midnight: read back in Asia/Bangkok, it is the date that was entered.

CREATE FUNCTION end_rental(
  p_org         uuid,
  p_rental      uuid,
  p_ended_on    date,
  p_reason      text,
  p_refund      numeric,
  p_refund_due  date
) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_property  uuid;
  v_deleted   integer;
BEGIN
  UPDATE rentals
     SET status = 'ended',
         ended_at = p_ended_on::timestamp AT TIME ZONE 'Asia/Bangkok',
         ended_reason = NULLIF(btrim(p_reason), '')
   WHERE id = p_rental AND org_id = p_org AND status = 'active'
  RETURNING property_id INTO v_property;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rental not active' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM payments
   WHERE rental_id = p_rental AND org_id = p_org
     AND settled_date IS NULL
     AND due_date > p_ended_on;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Returned by the Owner, followed by the Org. `out` is who pays: the money is
  -- due back to the Tenant (ADR 0011, amended).
  IF COALESCE(p_refund, 0) > 0 THEN
    INSERT INTO payments (org_id, rental_id, property_id, direction, type, due_date, amount)
    VALUES (p_org, p_rental, v_property, 'out', 'deposit_refund', p_refund_due, p_refund);
  END IF;

  UPDATE properties SET status = 'available' WHERE id = v_property AND org_id = p_org;

  RETURN v_deleted;
END;
$$;

-- ─── renew_rental ────────────────────────────────────────────────────────────
-- Ends the current Rental on its own end date and starts the next the day
-- after, same Property, same Tenant, same snapshots and flags. Nothing is due
-- after the old end date by construction, so nothing is deleted, and there is
-- no Deposit Refund: the Deposit stays with the Owner and the next Rental
-- carries the amount for reference. Its schedule has no Deposit line
-- (`depositHeld`) and bills the Commission again. The Property stays `rented`
-- throughout — the old row is ended before the new one is inserted, so
-- rentals_one_active_per_property never sees two.

CREATE FUNCTION renew_rental(
  p_org       uuid,
  p_rental    uuid,
  p_next      jsonb,
  p_schedule  jsonb
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_old  rentals%ROWTYPE;
  v_new  uuid;
BEGIN
  UPDATE rentals
     SET status = 'ended',
         ended_at = end_date::timestamp AT TIME ZONE 'Asia/Bangkok',
         ended_reason = 'Renewed'
   WHERE id = p_rental AND org_id = p_org AND status = 'active'
  RETURNING * INTO v_old;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rental not active' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO rentals (
    org_id, property_id, tenant_id, tenant_name_snapshot, tenant_phone_snapshot,
    start_date, end_date, monthly_rent, deposit, commission,
    rented_by_us, rent_tracked_by_us
  )
  VALUES (
    p_org, v_old.property_id, v_old.tenant_id, v_old.tenant_name_snapshot, v_old.tenant_phone_snapshot,
    v_old.end_date + 1,
    (p_next->>'end_date')::date,
    (p_next->>'monthly_rent')::numeric,
    v_old.deposit,
    (p_next->>'commission')::numeric,
    v_old.rented_by_us,
    v_old.rent_tracked_by_us
  )
  RETURNING id INTO v_new;

  INSERT INTO payments (org_id, rental_id, property_id, direction, type, due_date, amount,
                        settled_date, settled_amount)
  SELECT p_org, v_new, v_old.property_id, s.direction, s.type, s.due_date, s.amount,
         s.settled_date, s.settled_amount
    FROM jsonb_to_recordset(COALESCE(p_schedule, '[]'::jsonb)) AS s(
      direction payment_direction, type payment_type, due_date date, amount numeric,
      settled_date date, settled_amount numeric
    );

  RETURN v_new;
END;
$$;

-- ─── delete_rental ───────────────────────────────────────────────────────────
-- For a Rental entered by mistake: a real DELETE (ADR 0009's spirit), allowed
-- only while nothing under it is settled and no Rental Document is attached.
-- Past that point it is history, and history is ended, not erased. Payments
-- cascade. Returns the Property id so the caller can refresh its pages.

CREATE FUNCTION delete_rental(p_org uuid, p_rental uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_property  uuid;
  v_status    rental_status;
BEGIN
  IF EXISTS (SELECT 1 FROM payments
              WHERE rental_id = p_rental AND org_id = p_org AND settled_date IS NOT NULL) THEN
    RAISE EXCEPTION 'rental has a settled payment' USING ERRCODE = 'SL001';
  END IF;
  IF EXISTS (SELECT 1 FROM rental_documents WHERE rental_id = p_rental AND org_id = p_org) THEN
    RAISE EXCEPTION 'rental has a document' USING ERRCODE = 'SL002';
  END IF;

  DELETE FROM rentals WHERE id = p_rental AND org_id = p_org
  RETURNING property_id, status INTO v_property, v_status;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rental not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_status = 'active' THEN
    UPDATE properties SET status = 'available' WHERE id = v_property AND org_id = p_org;
  END IF;

  RETURN v_property;
END;
$$;

-- ─── org_rental_counts ───────────────────────────────────────────────────────
-- The chips above the Rentals list, in one row (ADR 0005). `ending_this_month`
-- is org_dashboard's calendar-month rule and counts every active Rental,
-- let-elsewhere included — that room coming free is the reason it was recorded.
-- `past_end_date` stands in for the expiry job that has no scheduler yet
-- (ADR 0012): active Rentals whose end date has gone by.

CREATE FUNCTION org_rental_counts(p_org uuid, p_today date)
RETURNS TABLE (
  active             integer,
  let_elsewhere      integer,
  ending_this_month  integer,
  past_end_date      integer,
  ended              integer
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    count(*) FILTER (WHERE status = 'active' AND (rented_by_us OR rent_tracked_by_us))::integer,
    count(*) FILTER (WHERE status = 'active' AND NOT rented_by_us AND NOT rent_tracked_by_us)::integer,
    count(*) FILTER (
      WHERE status = 'active'
        AND end_date >= date_trunc('month', p_today)::date
        AND end_date <  (date_trunc('month', p_today) + interval '1 month')::date
    )::integer,
    count(*) FILTER (WHERE status = 'active' AND end_date < p_today)::integer,
    count(*) FILTER (WHERE status = 'ended')::integer
  FROM rentals
  WHERE org_id = p_org
$$;

-- ─── org_dashboard ───────────────────────────────────────────────────────────
-- Same function as 0003 with one change: Active Rentals no longer counts a room
-- let by another agent. The agency is not involved in that tenancy, and the
-- tile is the agency's workload. Ending this month still counts it.
--
-- CREATE OR REPLACE with an unchanged signature keeps the existing grants, but
-- the REVOKE below is repeated anyway: whether this ever becomes a DROP and
-- CREATE (0013's case) should not decide whether anon can read an Org's numbers.

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
      WHERE org_id = p_org AND status = 'active'
        AND (rented_by_us OR rent_tracked_by_us))::integer,
    (SELECT count(*) FROM rentals
      WHERE org_id = p_org
        AND status = 'active'
        AND end_date >= date_trunc('month', p_today)::date
        AND end_date <  (date_trunc('month', p_today) + interval '1 month')::date)::integer,
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

-- ─── Grants ──────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION create_rental(uuid, uuid, uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION end_rental(uuid, uuid, date, text, numeric, date)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION renew_rental(uuid, uuid, jsonb, jsonb)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION delete_rental(uuid, uuid)                           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION org_rental_counts(uuid, date)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION org_dashboard(uuid, date)                           FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION create_rental(uuid, uuid, uuid, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION end_rental(uuid, uuid, date, text, numeric, date)   TO authenticated;
GRANT EXECUTE ON FUNCTION renew_rental(uuid, uuid, jsonb, jsonb)              TO authenticated;
GRANT EXECUTE ON FUNCTION delete_rental(uuid, uuid)                           TO authenticated;
GRANT EXECUTE ON FUNCTION org_rental_counts(uuid, date)                       TO authenticated;
GRANT EXECUTE ON FUNCTION org_dashboard(uuid, date)                           TO authenticated;

-- ─── Indexes ─────────────────────────────────────────────────────────────────
-- The Rentals list's keyset: newest first, id breaking ties (lib/cursor.ts).

CREATE INDEX rentals_org_created_idx ON rentals (org_id, created_at DESC, id DESC);
