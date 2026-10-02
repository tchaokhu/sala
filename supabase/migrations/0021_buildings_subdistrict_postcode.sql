-- A Building's subdistrict and postcode, beside the district and province it
-- already has.
--
-- The four are now picked in order — province, district, subdistrict — from the
-- official list in lib/thai-places.json, stored in Thai as the existing rows
-- are, and the postcode is the subdistrict's own (lib/thai-places.ts
-- resolveAddress). Names are checked there, not here: a CHECK would copy ~8,000
-- names into SQL, a second list to drift from the first, and the Server Action
-- is the only writer (ADR 0002). The postcode's shape is cheap to hold here.
--
-- '' rather than NULL for "not given", as district and province already do.
-- No index: nothing filters or sorts on either yet.

ALTER TABLE buildings
  ADD COLUMN subdistrict text NOT NULL DEFAULT '',
  ADD COLUMN postcode    text NOT NULL DEFAULT ''
    CHECK (postcode = '' OR postcode ~ '^[0-9]{5}$');

-- Laem Chabang is a city municipality inside Si Racha district, not a district;
-- the official list has no such district, so the one Building recorded with it
-- would open its edit form blank. Decided with the user on 2026-10-02.
UPDATE buildings SET district = 'ศรีราชา'
 WHERE province = 'ชลบุรี' AND district = 'แหลมฉบัง';
