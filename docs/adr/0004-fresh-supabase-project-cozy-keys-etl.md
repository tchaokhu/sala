# The Supabase project is new; Cozy Keys is loaded into it, not upgraded in place

[0003](./0003-cozy-keys-becomes-org-one.md) makes Cozy Keys the first Org and
retires its repo, but leaves open *which* database Sala runs on. It runs on a new
Supabase project, provisioned for Sala. Cozy Keys' existing project is a source to
read from during a one-time migration, never the thing Sala's schema is applied on
top of.

The alternative — apply Sala's migrations onto Cozy Keys' current project and
transform its tables in place — was rejected. Cozy Keys' schema came from a
`supabase-schema.sql` that is not in its repo, so its exact shape and indexes
cannot be established from source; its tables carry no `org_id` and its policies
call `is_admin()` unwrapped. Sala's `0001_init.sql` assumes a clean `public`
schema — `db:reset` drops `public` outright — so applying it over live Cozy Keys
tables collides rather than migrates. Reusing the old project would also drag a
schema [0001](./0001-shared-database-with-rls.md) exists to replace into the
database Sala is meant to keep uniform, and would give Org one a physical
distinctness [0003](./0003-cozy-keys-becomes-org-one.md) forbids.

## Consequences

Cutover is an ETL, not an upgrade. A one-time script reads Cozy Keys' database,
maps each row onto Sala's shape, and inserts it under the first Org's `org_id`;
the new project is authoritative from the first insert. The old project stays
readable until the load is verified, then Cozy Keys is archived per
[0003](./0003-cozy-keys-becomes-org-one.md).

The migration owns the mapping problems that follow from the schema gap: Cozy
Keys' `admins` become the first Org's `memberships`, its property and rental rows
acquire an `org_id`, and anything whose Cozy Keys shape has no Sala column is
resolved in the script, not by bending the schema to fit. Cozy Keys' `is_admin()`
world does not come across; the rows land under Sala's Membership model.

Provisioning is therefore a prerequisite for the production gateway and every
integration test that needs a real session. The seam in
[0002](./0002-writes-through-server-actions.md) is what kept that gap testable
while it lasted.

## Provisioned, 2026-07-28

The project exists, in `ap-southeast-1`, and the migrations are on it: eleven
tables, forty-two policies, RLS and a `NOT NULL org_id` on every one, both
storage buckets private. `0002_storage.sql` ran for real for the first time
here — it no-ops against a plain Postgres, so the bucket and its policies had
never executed until this point.

What that settles, which this ADR previously listed as unverified: the magic
link round trip and the callback's code exchange, `requireMember` performing its
read as a signed-in user against real RLS, and `org_dashboard` answering through
PostgREST. Cozy Keys is Org one, `cozy-keys`, with the first owner Membership
inserted by hand — there is deliberately no INSERT policy on `orgs`
([0002](./0002-writes-through-server-actions.md)), so that step is the
operator's and stays the operator's.

Two things worth knowing before touching this project again. The direct database
host resolves to IPv6 only, which is unroutable from at least one network the
work happens on; the session pooler URI on port 5432 is what connects.
`scripts/db-apply-remote.mjs` is a first-run bootstrapper — a migration written
after that first run is applied by naming it on the command line, since
re-running `0001_init.sql` errors rather than diverging quietly. There is no
migration ledger on the project yet; whether one arrives via the Supabase CLI is
still open, and until it does, which migrations a project has had is tracked by
nothing but this repo's history.
