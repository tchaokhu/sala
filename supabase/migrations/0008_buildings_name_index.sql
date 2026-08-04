-- Buildings are now picked by name, not just joined to.
--
-- The โครงการ combobox on the Property form reads an Org's Buildings ordered by
-- name, and the management page filters them by name. `buildings_org_idx`
-- covers the org_id half only, leaving a sort on every read; this covers both.
--
-- No new column: 0001_init.sql already gave buildings name, name_en, district,
-- province and google_map_url. See docs/adr/0008-buildings-name-properties.md.

CREATE INDEX IF NOT EXISTS buildings_org_name_idx ON buildings (org_id, name);
