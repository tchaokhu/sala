-- Sala initial schema.
--
-- Shape rules, enforced by tests/rls/schema-shape.test.ts:
--   * every table in `public` except orgs and memberships carries
--     `org_id uuid NOT NULL REFERENCES orgs(id)`
--   * every such table has RLS enabled and a policy for each of
--     SELECT / INSERT / UPDATE / DELETE
--   * every such table has an index on org_id
--
-- Policies call the membership helpers wrapped in a subquery —
-- `(SELECT is_member(org_id))` rather than `is_member(org_id)` — so the planner
-- makes them an InitPlan evaluated once per statement instead of risking a call
-- per row. See CLAUDE.md.
--
-- See docs/adr/0001-shared-database-with-rls.md.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Orgs and membership ─────────────────────────────────────────────────────
-- These two are the allowlisted exceptions: an Org cannot belong to an Org, and
-- membership is what the org_id rule is defined in terms of.

CREATE TABLE orgs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               text NOT NULL UNIQUE
                       CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 2 AND 40),
  name               text NOT NULL CHECK (length(btrim(name)) > 0),
  -- sha256 of the Inquiry intake secret. The secret itself is shown once, at
  -- creation, and never stored — a database dump must not hand out write access.
  intake_token_hash  bytea UNIQUE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE org_role AS ENUM ('owner', 'member');

CREATE TABLE memberships (
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  role        org_role NOT NULL DEFAULT 'member',
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

CREATE INDEX memberships_user_idx ON memberships (user_id);

-- ─── Membership helpers ──────────────────────────────────────────────────────
-- SECURITY DEFINER so they read `memberships` without tripping that table's own
-- policies, which would recurse. STABLE so a wrapping subquery can be hoisted.

CREATE OR REPLACE FUNCTION is_member(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE org_id = p_org AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION is_org_owner(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE org_id = p_org AND user_id = auth.uid() AND role = 'owner'
  )
$$;

GRANT EXECUTE ON FUNCTION is_member(uuid), is_org_owner(uuid) TO authenticated;

-- ─── updated_at ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ─── Inventory ───────────────────────────────────────────────────────────────

CREATE TABLE buildings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (length(btrim(name)) > 0),
  name_en         text,
  district        text NOT NULL,
  province        text NOT NULL,
  google_map_url  text,
  facilities      text[] NOT NULL DEFAULT '{}',
  nearby          text[] NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE owners (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(btrim(name)) > 0),
  phone       text NOT NULL,
  email       text,
  line_id     text,
  note        text,
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE property_type AS ENUM ('condo', 'house', 'townhome');
CREATE TYPE property_status AS ENUM ('available', 'reserved', 'rented');

CREATE TABLE properties (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  title          text NOT NULL CHECK (length(btrim(title)) > 0),
  title_en       text,
  description    text,
  price_monthly  numeric(12,2) NOT NULL CHECK (price_monthly >= 0),
  property_type  property_type NOT NULL,
  bedrooms       smallint NOT NULL DEFAULT 0 CHECK (bedrooms >= 0),
  bathrooms      smallint NOT NULL DEFAULT 0 CHECK (bathrooms >= 0),
  area_sqm       numeric(8,2) NOT NULL DEFAULT 0 CHECK (area_sqm >= 0),
  floor          smallint,
  room_number    text,
  location       text NOT NULL DEFAULT '',
  district       text NOT NULL DEFAULT '',
  province       text NOT NULL DEFAULT '',
  status         property_status NOT NULL DEFAULT 'available',
  images         text[] NOT NULL DEFAULT '{}',
  contact_line   text,
  owner_id       uuid REFERENCES owners(id) ON DELETE SET NULL,
  building_id    uuid REFERENCES buildings(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ─── Tenancy ─────────────────────────────────────────────────────────────────

CREATE TABLE tenants (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name               text NOT NULL CHECK (length(btrim(name)) > 0),
  phone              text,
  email              text,
  line_id            text,
  -- Identity document. Never logged, never in an error message. See CLAUDE.md.
  id_card            text,
  address            text,
  emergency_contact  text,
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE rental_status AS ENUM ('active', 'ended', 'cancelled');

CREATE TABLE rentals (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  property_id            uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  tenant_id              uuid REFERENCES tenants(id) ON DELETE SET NULL,
  -- Kept even when the Tenant record is later removed: a past tenancy has to
  -- stay readable as a historical record.
  tenant_name_snapshot   text NOT NULL,
  tenant_phone_snapshot  text,
  start_date             date NOT NULL,
  end_date               date NOT NULL,
  monthly_rent           numeric(12,2) NOT NULL CHECK (monthly_rent >= 0),
  deposit                numeric(12,2) NOT NULL DEFAULT 0 CHECK (deposit >= 0),
  commission             numeric(12,2) NOT NULL DEFAULT 0 CHECK (commission >= 0),
  rented_by_us           boolean NOT NULL DEFAULT false,
  status                 rental_status NOT NULL DEFAULT 'active',
  ended_at               timestamptz,
  ended_reason           text,
  note                   text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rentals_dates_ordered CHECK (end_date >= start_date)
);

-- A Property can only be let to one Tenant at a time. Enforced here rather than
-- in application code, which is where Cozy Keys kept its Property/Rental rules.
CREATE UNIQUE INDEX rentals_one_active_per_property
  ON rentals (property_id) WHERE status = 'active';

-- ─── Money ───────────────────────────────────────────────────────────────────

CREATE TYPE payment_direction AS ENUM ('in', 'out');
CREATE TYPE payment_type AS ENUM ('rent', 'deposit', 'commission', 'deposit_refund', 'other');
CREATE TYPE payment_method AS ENUM ('cash', 'transfer', 'other');

CREATE TABLE payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  rental_id       uuid NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
  property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  direction       payment_direction NOT NULL DEFAULT 'in',
  type            payment_type NOT NULL,
  due_date        date NOT NULL,
  amount          numeric(12,2) NOT NULL CHECK (amount > 0),
  settled_date    date,
  settled_amount  numeric(12,2) CHECK (settled_amount >= 0),
  method          payment_method,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- A settled date without an amount, or an amount without a date, means
  -- someone half-finished a form. Neither should reach the ledger.
  CONSTRAINT payments_settlement_complete
    CHECK ((settled_date IS NULL) = (settled_amount IS NULL)),
  -- A deposit refund is always money leaving. The reverse is not constrained:
  -- an agency may well owe a Tenant something that is not a deposit.
  CONSTRAINT payments_refund_direction
    CHECK (type <> 'deposit_refund' OR direction = 'out')
);

-- ─── Leads and paperwork ─────────────────────────────────────────────────────

CREATE TYPE inquiry_status AS ENUM ('new', 'contacted', 'closed');

CREATE TABLE inquiries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  property_id     uuid REFERENCES properties(id) ON DELETE SET NULL,
  name            text NOT NULL,
  phone           text NOT NULL,
  email           text,
  message         text,
  preferred_date  date,
  status          inquiry_status NOT NULL DEFAULT 'new',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE document_category AS ENUM ('rental_contract', 'agency_contract', 'receipt', 'other');

CREATE TABLE document_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  category      document_category NOT NULL DEFAULT 'other',
  title         text NOT NULL CHECK (length(btrim(title)) > 0),
  description   text,
  storage_path  text NOT NULL,
  file_name     text NOT NULL,
  size_bytes    bigint NOT NULL CHECK (size_bytes > 0),
  uploaded_by   uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rental_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  rental_id     uuid NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  file_name     text NOT NULL,
  mime_type     text NOT NULL,
  size_bytes    bigint NOT NULL CHECK (size_bytes > 0),
  uploaded_by   uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
-- org_id on everything, because every query filters by it. Foreign keys and the
-- columns actually used for filtering and ordering, because Cozy Keys shipped
-- without them and nobody could tell from the source.

CREATE INDEX buildings_org_idx           ON buildings (org_id);
CREATE INDEX owners_org_idx              ON owners (org_id);
CREATE INDEX properties_org_idx          ON properties (org_id);
CREATE INDEX properties_org_status_idx   ON properties (org_id, status);
CREATE INDEX properties_owner_idx        ON properties (owner_id);
CREATE INDEX properties_building_idx     ON properties (building_id);
CREATE INDEX tenants_org_idx             ON tenants (org_id);
CREATE INDEX rentals_org_idx             ON rentals (org_id);
CREATE INDEX rentals_property_idx        ON rentals (property_id);
CREATE INDEX rentals_tenant_idx          ON rentals (tenant_id);
-- Drives the nightly expiry job: active rentals whose end_date has passed.
CREATE INDEX rentals_expiry_idx          ON rentals (end_date) WHERE status = 'active';
CREATE INDEX payments_org_idx            ON payments (org_id);
CREATE INDEX payments_rental_idx         ON payments (rental_id);
CREATE INDEX payments_property_idx       ON payments (property_id);
CREATE INDEX payments_org_due_idx        ON payments (org_id, due_date);
-- Outstanding money, the query the dashboard actually cares about.
CREATE INDEX payments_unsettled_idx      ON payments (org_id, due_date) WHERE settled_date IS NULL;
CREATE INDEX inquiries_org_idx           ON inquiries (org_id);
CREATE INDEX inquiries_org_status_idx    ON inquiries (org_id, status, created_at DESC);
CREATE INDEX inquiries_property_idx      ON inquiries (property_id);
CREATE INDEX document_templates_org_idx  ON document_templates (org_id);
CREATE INDEX rental_documents_org_idx    ON rental_documents (org_id);
CREATE INDEX rental_documents_rental_idx ON rental_documents (rental_id, created_at DESC);

-- ─── updated_at triggers ─────────────────────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'orgs', 'buildings', 'owners', 'properties', 'tenants', 'rentals',
    'payments', 'inquiries', 'document_templates', 'rental_documents'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',
      'touch_' || t, t
    );
  END LOOP;
END $$;

-- ─── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;

-- No INSERT or DELETE policy: Orgs are created by the operator through the SQL
-- editor, not by the application. Sala is invite-only and there is no sign-up
-- path that should be able to mint one.
CREATE POLICY orgs_member_read ON orgs
  FOR SELECT TO authenticated USING ((SELECT is_member(id)));
CREATE POLICY orgs_owner_update ON orgs
  FOR UPDATE TO authenticated
  USING ((SELECT is_org_owner(id))) WITH CHECK ((SELECT is_org_owner(id)));

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY memberships_member_read ON memberships
  FOR SELECT TO authenticated USING ((SELECT is_member(org_id)));
CREATE POLICY memberships_owner_insert ON memberships
  FOR INSERT TO authenticated WITH CHECK ((SELECT is_org_owner(org_id)));
CREATE POLICY memberships_owner_update ON memberships
  FOR UPDATE TO authenticated
  USING ((SELECT is_org_owner(org_id))) WITH CHECK ((SELECT is_org_owner(org_id)));
CREATE POLICY memberships_owner_delete ON memberships
  FOR DELETE TO authenticated USING ((SELECT is_org_owner(org_id)));

-- Every org-scoped table gets the same four policies. Uniformity is the point:
-- one pattern to get right, and a deviation is visible by inspection.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'buildings', 'owners', 'properties', 'tenants', 'rentals',
    'payments', 'inquiries', 'document_templates', 'rental_documents'
  ] LOOP
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

-- ─── Inquiry intake ──────────────────────────────────────────────────────────
-- The one write that arrives without a session: a bot or automation posting a
-- lead. It gets a SECURITY DEFINER function rather than a policy, so `anon`
-- never holds a direct INSERT grant on the table — and never the service role
-- key either. The secret is what names the Org; nothing in the arguments is
-- trusted to. See docs/adr/0002-writes-through-server-actions.md.

CREATE OR REPLACE FUNCTION create_inquiry_via_token(
  p_token          text,
  p_name           text,
  p_phone          text,
  p_email          text DEFAULT NULL,
  p_message        text DEFAULT NULL,
  p_preferred_date date DEFAULT NULL,
  p_property_id    uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
-- `extensions` is where Supabase keeps pgcrypto; locally it lands in public.
-- Naming both means digest() resolves in either, and a missing schema in a
-- search_path is not an error.
SET search_path = public, extensions
AS $$
DECLARE
  v_org uuid;
  v_id  uuid;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RAISE EXCEPTION 'invalid intake token';
  END IF;

  SELECT id INTO v_org FROM orgs
   WHERE intake_token_hash = digest(p_token, 'sha256');

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'invalid intake token';
  END IF;

  -- A Property id from the caller is only honoured when it belongs to the Org
  -- the token names. Otherwise the lead is filed without one.
  IF p_property_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM properties WHERE id = p_property_id AND org_id = v_org)
  THEN
    p_property_id := NULL;
  END IF;

  INSERT INTO inquiries (org_id, property_id, name, phone, email, message, preferred_date)
  VALUES (v_org, p_property_id, btrim(p_name), btrim(p_phone), p_email, p_message, p_preferred_date)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION create_inquiry_via_token(text, text, text, text, text, date, uuid) FROM public;
GRANT EXECUTE ON FUNCTION create_inquiry_via_token(text, text, text, text, text, date, uuid)
  TO anon, authenticated;
