-- Owners get a Facebook link, and the list that reads them gets its index.
--
-- `owners` has sat in the schema since 0001_init.sql — name, phone, email,
-- line_id, note, source — with no app code on top of it. This is the one column
-- that first cut needs and 0001 did not have: agencies reach a lot of these
-- people through Facebook rather than a phone call.
--
-- Freeform text like `line_id`, not a URL CHECK: what a person pastes is a
-- profile link, a vanity name or a page id, and a constraint here would refuse
-- rows the form has no way to fix. `safeHttpUrl` in lib/validate.ts is what
-- keeps a javascript: link out at the point it is entered.
--
-- `owners.source` is deliberately left alone — unused, no established meaning,
-- and no form writes it.

ALTER TABLE owners ADD COLUMN IF NOT EXISTS facebook_url text;

-- The Owner picker on the Property form reads an Org's Owners ordered by name,
-- and the Owners page filters them by name. `owners_org_idx` covers the org_id
-- half only, leaving a sort on every read; this covers both — the same gap
-- 0008 closed for buildings.
CREATE INDEX IF NOT EXISTS owners_org_name_idx ON owners (org_id, name);
