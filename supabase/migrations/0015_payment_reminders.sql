-- When a Payment was last reminded about.
--
-- The agency follows the monthly rent as a service (ADR 0011, amended): the
-- system tells the agent a payment is due, the agent chases the Tenant. That
-- needs one fact per Payment — when it was last mentioned — or "remind again in
-- two days" is not expressible and a re-run of the job double-sends.
--
-- A column rather than a `reminders` table. What the schedule needs to know is
-- a single date per Payment, and the audit trail a table would add is not worth
-- a row per Payment per two days until something actually reads it. If a
-- delivery log is ever needed it can arrive then, and this column stays true.
--
-- Deliberately not `NOT NULL`: null means "never mentioned", which is what
-- every Payment starts as and what the first reminder looks for. A default of
-- today would make every new Payment look already-reminded.

ALTER TABLE payments ADD COLUMN last_reminded_on date;

COMMENT ON COLUMN payments.last_reminded_on IS
  'Bangkok date this Payment last appeared in a reminder to the Org, or null if '
  'it never has. Only rent Payments on Rentals the Org follows are reminded '
  'about; see scripts/send-rent-reminders.mjs and ADR 0012.';

-- The reminder job's whole query: unsettled rent, by due date, inside one Org.
-- Partial on `settled_date IS NULL` because a settled Payment is never a
-- candidate again and the index should not carry the years of them that
-- accumulate (CLAUDE.md — Payments grow by twelve rows per Rental per year and
-- are never deleted).
CREATE INDEX payments_due_unsettled_idx
  ON payments (org_id, due_date, last_reminded_on)
  WHERE settled_date IS NULL;
