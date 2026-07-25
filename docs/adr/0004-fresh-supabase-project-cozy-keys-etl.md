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
integration test that needs a real session. Until the project exists, the
membership gate is proven only against the local Postgres in `tests/rls/`, and the
Supabase-backed `MemberGateway` compiles but is unverified — the seam in
[0002](./0002-writes-through-server-actions.md) is what keeps that gap testable.
