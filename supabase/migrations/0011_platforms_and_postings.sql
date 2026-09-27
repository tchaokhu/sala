-- Platforms and Postings — where an Org has advertised each Property.
--
-- Ported from Cozy Keys' `posting_platforms` / `property_postings` per
-- docs/adr/0003-cozy-keys-becomes-org-one.md, with two deliberate changes.
--
-- 1. Both are org-scoped. Cozy Keys' pair carried no `org_id` at all — it was a
--    single-agency database and never needed one. Here they take one like every
--    other table, with the same four policies and an index (0001). Each Org
--    keeps its own channel list the way it keeps its own Buildings: two agencies
--    both posting to Livinginsider hold a row each.
--
-- 2. A Posting row exists only when the Property really is posted. Cozy Keys
--    upserted every active platform on every Property save, so most of its rows
--    meant "not posted" — 300 Properties across 8 channels is 2,400 rows to
--    record a few hundred facts. Absence says it here, which also turns the
--    question the feature exists for — which Properties is nobody marketing —
--    into a NOT EXISTS rather than a scan for `posted = false`.
--
-- Un-ticking a channel therefore deletes the row. There is no `posted boolean`
-- to set false, and no third state: this table records what was done, not what
-- somebody means to do.

CREATE TABLE platforms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(btrim(name)) > 0),
  -- Where it sits in the tick-list on the Property form. Ties break by name.
  sort_order  integer NOT NULL DEFAULT 0,
  -- A channel an Org has stopped using drops off the form without taking its
  -- history with it: existing Postings still name it.
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE postings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  property_id  uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  -- RESTRICT, not CASCADE: a channel with history cannot be dropped, only made
  -- inactive. There is no delete path in the UI, and this is what makes that true
  -- of the database as well rather than only of the page (ADR 0009).
  platform_id  uuid NOT NULL REFERENCES platforms(id) ON DELETE RESTRICT,
  -- The advertisement itself, when there is a link to keep. Optional: a room
  -- posted to a LINE group has nowhere to point.
  post_url     text,
  -- When it went up, in Bangkok terms (CLAUDE.md). Separate from `created_at`
  -- because a Posting is often entered days after the fact, and staleness is
  -- measured from when it was advertised, not from when someone typed it in.
  posted_on    date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Bangkok')::date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- One row per Property per channel. Posting the same room twice to the same
  -- place is an edit of the link, not a second fact.
  UNIQUE (property_id, platform_id)
);

-- A channel named twice in one Org is a typo, not two channels.
CREATE UNIQUE INDEX platforms_org_name_key ON platforms (org_id, lower(btrim(name)));

CREATE INDEX platforms_org_idx        ON platforms (org_id, active, sort_order);
CREATE INDEX postings_org_idx         ON postings (org_id);
-- Both directions get read: a Property's chips on the list, and a Platform's
-- reach. The first also serves the NOT EXISTS behind "posted nowhere".
CREATE INDEX postings_property_idx    ON postings (property_id);
CREATE INDEX postings_platform_idx    ON postings (platform_id);

CREATE TRIGGER touch_platforms BEFORE UPDATE ON platforms
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER touch_postings BEFORE UPDATE ON postings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- The same four policies every org-scoped table gets, written the same way, so
-- a deviation stays visible by inspection (0001).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platforms', 'postings'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated
         USING ((SELECT is_member(org_id)))', t || '_member_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT TO authenticated
         WITH CHECK ((SELECT is_member(org_id)))', t || '_member_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE TO authenticated
         USING ((SELECT is_member(org_id)))
         WITH CHECK ((SELECT is_member(org_id)))', t || '_member_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE TO authenticated
         USING ((SELECT is_member(org_id)))', t || '_member_delete', t);
  END LOOP;
END $$;
