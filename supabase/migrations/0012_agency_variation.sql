-- Two ways agencies differ, made into columns rather than code paths.
-- See docs/adr/0011-agencies-differ-and-the-difference-is-a-column.md.

-- ─── Who holds the rent ──────────────────────────────────────────────────────
-- For some Orgs the Tenant transfers to the agency, which passes the money on
-- to the Owner. For others the Tenant pays the Owner directly and the agency's
-- income is the Commission at signing. The Org carries the default; the Rental
-- carries the fact, because one agency does both depending on the room.

-- False for a new Org on purpose. An Org that should collect and does not yet
-- notices on the first Rental and flips a switch; an Org that should not
-- collect and does gets a year of `payments` rows somebody has to find and
-- delete. The two mistakes are not the same size.
ALTER TABLE orgs
  ADD COLUMN collects_rent boolean NOT NULL DEFAULT false;

-- The default exists so this ALTER is safe on rows that predate the column, not
-- as the value the application should rely on: every write passes the Org's
-- setting explicitly, so that changing the Org default never silently rewrites
-- what an existing Rental agreed to.
ALTER TABLE rentals
  ADD COLUMN rent_collected_by_us boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN rentals.rent_collected_by_us IS
  'Whether the Org handles this tenancy''s monthly rent. Gates the rent leg of '
  'buildPaymentSchedule only — deposit, deposit refund and commission are '
  'generated either way.';

-- ─── Whose Property it is ────────────────────────────────────────────────────
-- `own` is a room an Owner entrusted to the Org. `sourced` is a room the Org
-- found elsewhere — a public group, another agent — and can show a customer
-- without holding anything. A young agency offers mostly the second kind.

CREATE TYPE property_mandate AS ENUM ('own', 'sourced');

-- Every Property that exists today came from the Org's own book, so 'own' is
-- the correct backfill as well as a safe default.
ALTER TABLE properties
  ADD COLUMN mandate property_mandate NOT NULL DEFAULT 'own';

-- A room the Org does not hold cannot have an Owner on file. Enforced here
-- rather than in the form because the form is not the only writer — the Cozy
-- Keys ETL is another, and so is anything added later.
ALTER TABLE properties
  ADD CONSTRAINT properties_sourced_has_no_owner
  CHECK (mandate = 'own' OR owner_id IS NULL);

-- The Properties list separates the two kinds by default, so this is a filter
-- on every load. Indexed in the same migration as the column (CLAUDE.md).
CREATE INDEX properties_org_mandate_idx ON properties (org_id, mandate);
