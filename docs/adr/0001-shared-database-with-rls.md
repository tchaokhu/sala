# One database for every Org, isolated by RLS

Sala holds several rental agencies' books side by side, and each agency's data
must be invisible to every other. We put all Orgs in a single Supabase project:
every table carries `org_id NOT NULL` and a Row Level Security policy that admits
a row only when the caller holds a Membership in that Org. The alternative —
a Supabase project per Org — buys physical isolation but makes every schema
change an N-times deployment and turns onboarding an agency into an
infrastructure task, which is the wrong trade for a system we run ourselves and
grow one invited agency at a time.

## Consequences

A single missing or wrong policy leaks one agency's data to another, and nothing
in the application would report it. Two things follow from that and are not
optional:

- **Every table takes the same shape.** `org_id NOT NULL` plus a policy per
  operation, with no per-table cleverness. Uniformity is the mitigation: there is
  one pattern to get right, and a wrong one is visible by inspection. `orgs` and
  `memberships` are the only exceptions and are named explicitly in the test
  allowlist.
- **A test asserts the shape against the live catalog.** It reads `pg_tables` and
  `pg_policies` and fails when any table in `public` has RLS off, lacks
  `org_id NOT NULL`, or is missing a policy. A new table that forgets its policy
  breaks CI rather than shipping a hole. This must run against a real database,
  never a mock.

Cross-Org reporting is possible but never wanted — see
[0003](./0003-cozy-keys-becomes-org-one.md) for why no Org is privileged.

One job is allowed to ignore all of this. Expiring finished Rentals has to happen
for an Org whether or not anyone from that Org logs in, so it runs nightly under
the service role, which bypasses RLS by design. That key belongs to the scheduled
job and nothing else: it is never handed to a request handler, and any second use
of it should be treated as a mistake until argued otherwise.
