-- The rent flag asked the wrong question. It now asks the right one.
--
-- 0012 added `orgs.collects_rent` and `rentals.rent_collected_by_us` to record
-- whether the money passes through the agency, and used that to decide whether
-- a monthly rent schedule exists at all. The first real agency to be asked
-- about it separates the two:
--
--   * The Tenant transfers the monthly rent straight to the Owner. The agency
--     never holds it.
--   * The agency still follows every month and chases a late Tenant. That
--     following is a service it sells.
--
-- Under 0012's wording that Rental is `false` — no money held — and so it would
-- get no schedule, no due dates and no overdue anything, which is precisely the
-- work the agency is being paid to do. What decides whether a rent schedule
-- exists is not who holds the money. It is who has to chase it.
--
-- Renamed rather than re-purposed in place, because a column whose name says
-- one thing and whose meaning is another is a trap for whoever reads it next.
-- The values carry over untouched: every row 0012 set was set by looking for
-- settled rent Payments, which is evidence of tracking, not of custody.
--
-- The other half of the story — money that really does pass through the agency,
-- like a first payment collected and forwarded to the Owner less commission —
-- is a direction on a Payment (`in` / `out`, 0001), not a flag on the Rental.
-- Nothing here needs to change for that, and no column is being added for it
-- until there is a screen that would use it.
--
-- See docs/adr/0011-agencies-differ-and-the-difference-is-a-column.md.

ALTER TABLE orgs RENAME COLUMN collects_rent TO tracks_rent;

ALTER TABLE rentals RENAME COLUMN rent_collected_by_us TO rent_tracked_by_us;

COMMENT ON COLUMN orgs.tracks_rent IS
  'Default for new Rentals: does this Org follow the monthly rent? Not whether '
  'it holds the money — an Org can chase rent that is paid straight to the Owner.';

COMMENT ON COLUMN rentals.rent_tracked_by_us IS
  'Whether the Org follows this tenancy''s monthly rent, which is what decides '
  'if a rent schedule is generated. Deposit, deposit refund and commission are '
  'generated either way. Custody of the money is a Payment direction, not this.';
