# Foreign keys carry the Org

[0001](./0001-shared-database-with-rls.md) keeps Orgs apart with Row Level
Security, and RLS answers one question per row: may this caller see or write a
row with this `org_id`? It does not ask whether the ids *inside* the row belong
to the same Org. Until `0016_org_scoped_foreign_keys.sql` nothing did.

A Member of Org A could write a Rental under A's own `org_id` naming Org B's
Property. The INSERT policy admits the `org_id`; `REFERENCES properties(id)`
admits the id, because the Property exists. Nothing leaked — RLS on
`properties` hides B's row from every join A can run — but the database held a
claim it had never checked, and the first report that joined across it with the
service role would have printed B's room on A's books. The same held for every
edge between two Org-owned tables: ten of them, across `properties`, `rentals`,
`payments`, `inquiries`, `rental_documents` and `postings`.

## Decision

Every parent table gains `UNIQUE (id, org_id)`, and every foreign key between
two Org-owned tables becomes `(col, org_id) REFERENCES parent (id, org_id)`. A
child row can then name a parent only in its own Org, whoever writes it — a
Server Action, the ETL, the nightly job or the service role.

It is applied to every edge at once. Doing it table by table as each came up
would leave a schema where some edges are guarded and some are not, and 0001's
argument is that uniformity is what keeps a mistake visible.
`tests/rls/schema-shape.test.ts` reads `pg_constraint` and fails when any such
edge omits `org_id` on either side, so a table added later cannot forget.

`ON DELETE` behaviour is unchanged edge for edge. `SET NULL` names its column —
`ON DELETE SET NULL (owner_id)` — because a bare `SET NULL` on a composite key
nulls `org_id` too, which is `NOT NULL`, and every such delete would fail. The
column list needs Postgres 15; the project runs 17.

## Rejected

- **A trigger per child table that compares `org_id`s.** It does the same job
  in more code, runs per row, and is invisible to anyone reading the key.
- **Checking in the application only.** `ownedPlatformIds` in
  `lib/postings.ts` already refuses a foreign Platform, and it stays, because it
  turns the refusal into a sentence rather than a constraint name. But an
  application check covers only the path it sits on; the ETL and the service
  role do not go through it.
- **Guarding only `postings`, where it was found.** See above: the new table
  would have been the deviation.

## Consequences

Each parent carries one more index, on `(id, org_id)`. The children need none:
each FK column was already indexed, and since `id` is unique on its own, that
index serves the lookups a cascade or restrict check makes.

A Server Action that writes a child row still checks ownership first where the
caller needs a readable refusal. The key is the backstop, not the message.
