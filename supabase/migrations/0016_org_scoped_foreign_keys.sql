-- Every foreign key between two Org-owned tables now carries org_id.
--
-- Before this, `rentals.property_id REFERENCES properties(id)` checked only that
-- the Property existed. A Member of Org A could write a Rental under A's own
-- org_id pointing at Org B's Property: the INSERT policy admits the org_id, the
-- FK admits the id, and the row is a lie. Nothing leaked — RLS on the parent
-- hides the join — but the database was holding a claim it had never checked.
-- See docs/adr/0013-foreign-keys-carry-the-org.md.
--
-- The fix is the same on every edge, which is the point (0001): each parent
-- gains UNIQUE (id, org_id), and each child's FK becomes (col, org_id)
-- REFERENCES parent (id, org_id). A child row can then only name a parent in
-- its own Org, whoever writes it — a Server Action, the ETL, or the service role.
--
-- ON DELETE behaviour is kept edge for edge. SET NULL names its column: a bare
-- SET NULL on a composite key nulls org_id as well, which is NOT NULL and would
-- turn every such delete into an error. The column list needs Postgres 15; the
-- project runs 17.
--
-- No new indexes on the children. Each FK column already has one (0001, 0011),
-- and since `id` is unique on its own, an index on the column alone serves the
-- lookups a cascade or restrict check makes. The UNIQUE constraints below do add
-- an index per parent; that is the price of the guarantee.

-- ─── Parents ─────────────────────────────────────────────────────────────────

ALTER TABLE buildings  ADD CONSTRAINT buildings_id_org_key  UNIQUE (id, org_id);
ALTER TABLE owners     ADD CONSTRAINT owners_id_org_key     UNIQUE (id, org_id);
ALTER TABLE properties ADD CONSTRAINT properties_id_org_key UNIQUE (id, org_id);
ALTER TABLE tenants    ADD CONSTRAINT tenants_id_org_key    UNIQUE (id, org_id);
ALTER TABLE rentals    ADD CONSTRAINT rentals_id_org_key    UNIQUE (id, org_id);
ALTER TABLE platforms  ADD CONSTRAINT platforms_id_org_key  UNIQUE (id, org_id);

-- ─── Children ────────────────────────────────────────────────────────────────
-- Dropped and re-added under the same names, so an error message still names
-- the edge the way it always has.

ALTER TABLE properties
  DROP CONSTRAINT properties_building_id_fkey,
  ADD CONSTRAINT properties_building_id_fkey
    FOREIGN KEY (building_id, org_id) REFERENCES buildings (id, org_id)
    ON DELETE SET NULL (building_id),
  DROP CONSTRAINT properties_owner_id_fkey,
  ADD CONSTRAINT properties_owner_id_fkey
    FOREIGN KEY (owner_id, org_id) REFERENCES owners (id, org_id)
    ON DELETE SET NULL (owner_id);

ALTER TABLE rentals
  DROP CONSTRAINT rentals_property_id_fkey,
  ADD CONSTRAINT rentals_property_id_fkey
    FOREIGN KEY (property_id, org_id) REFERENCES properties (id, org_id)
    ON DELETE RESTRICT,
  DROP CONSTRAINT rentals_tenant_id_fkey,
  ADD CONSTRAINT rentals_tenant_id_fkey
    FOREIGN KEY (tenant_id, org_id) REFERENCES tenants (id, org_id)
    ON DELETE SET NULL (tenant_id);

ALTER TABLE payments
  DROP CONSTRAINT payments_property_id_fkey,
  ADD CONSTRAINT payments_property_id_fkey
    FOREIGN KEY (property_id, org_id) REFERENCES properties (id, org_id)
    ON DELETE RESTRICT,
  DROP CONSTRAINT payments_rental_id_fkey,
  ADD CONSTRAINT payments_rental_id_fkey
    FOREIGN KEY (rental_id, org_id) REFERENCES rentals (id, org_id)
    ON DELETE CASCADE;

ALTER TABLE inquiries
  DROP CONSTRAINT inquiries_property_id_fkey,
  ADD CONSTRAINT inquiries_property_id_fkey
    FOREIGN KEY (property_id, org_id) REFERENCES properties (id, org_id)
    ON DELETE SET NULL (property_id);

ALTER TABLE rental_documents
  DROP CONSTRAINT rental_documents_rental_id_fkey,
  ADD CONSTRAINT rental_documents_rental_id_fkey
    FOREIGN KEY (rental_id, org_id) REFERENCES rentals (id, org_id)
    ON DELETE CASCADE;

ALTER TABLE postings
  DROP CONSTRAINT postings_platform_id_fkey,
  ADD CONSTRAINT postings_platform_id_fkey
    FOREIGN KEY (platform_id, org_id) REFERENCES platforms (id, org_id)
    ON DELETE RESTRICT,
  DROP CONSTRAINT postings_property_id_fkey,
  ADD CONSTRAINT postings_property_id_fkey
    FOREIGN KEY (property_id, org_id) REFERENCES properties (id, org_id)
    ON DELETE CASCADE;
