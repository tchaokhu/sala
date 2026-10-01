-- One Building per name in an Org.
--
-- A Building is the named development a Property sits in (CONTEXT.md); two
-- rows with the same name in one Org are one development entered twice, with
-- the map, facilities and Properties split between them. That happened: the
-- Property form's Building combobox creates a Building when the typed name is
-- not picked from the list, and nothing refused the second "ดี คอนโด บลิซ" or
-- "ดี คอนโด เวล". Both pairs were merged by hand on 2026-10-01 before this ran.
--
-- Case and surrounding spaces do not make a different Building, the same rule
-- 0011 applies to Platform names. Two Orgs may still each keep a Building of the
-- same name — each Org keeps its own (CONTEXT.md: Building).
--
-- The application reuses the existing Building when a typed name already
-- exists (resolveBuilding), and says so when the Buildings page would create or
-- rename into a duplicate; this index is the backstop for every other writer.

CREATE UNIQUE INDEX buildings_org_name_key ON buildings (org_id, lower(btrim(name)));
