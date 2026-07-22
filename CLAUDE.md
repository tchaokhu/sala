# CLAUDE.md

Guidance for Claude Code working in this repository.

Read [CONTEXT.md](./CONTEXT.md) for the vocabulary and [docs/adr/](./docs/adr/)
for the decisions before proposing anything structural. The ADRs record rejected
alternatives — do not re-argue them from scratch.

There is no code yet. See [README.md](./README.md) for what gets scaffolded and
what gets ported from `../the-cozy-keys`.

## Ported code is not blessed code

Sala inherits `lib/` from Cozy Keys because the payment maths is correct and
tested, not because the surrounding patterns were good. Cozy Keys' data layer has
specific, diagnosed problems — every rule below exists because of one of them.
When porting a function, port the logic and leave the access pattern behind.

Three separate claims in Cozy Keys' own `CLAUDE.md` and `README.md` turned out to
contradict its code (a public site that no longer exists, a middleware check
described as absent when it is present, an upload fallback described as present
when it throws). Docs in this repo are load-bearing: when behaviour changes,
change the doc in the same commit or delete the claim.

## Performance

The failure mode to avoid is a page that issues a dozen small sequential requests
and downloads the whole table to compute one number in JavaScript. That is what
Cozy Keys' dashboard does, and it is why it feels slow.

- **Fetch on the server.** Pages are Server Components; data fetching starts
  during the render, not after the bundle hydrates. Client components exist for
  interactivity, and receive data as props. Cozy Keys starts every request from a
  `useEffect`, so nothing moves until the JS has booted.
- **Never chain independent queries.** Before adding an `await`, ask what it
  actually depends on. Cozy Keys' `getProperties` runs seven round-trips in
  series when the real dependency depth is three; one of them
  (`posting_platforms`) depends on nothing at all and still waits behind five
  others. Independent fetches go in one `Promise.all`.
- **Never block a render on a write.** Nightly maintenance belongs in the cron
  job (ADR 0001), not in front of the reads a page needs.
- **Every list query is bounded.** A `limit` and a cursor, always. There is no
  such thing as "we only have a few rows" — Payments grow by twelve rows per
  Rental per year and are never deleted once settled.
- **Aggregate in Postgres.** Counts, sums and monthly rollups are SQL, not a
  `reduce` over every row the client just downloaded.
- **Name the columns.** `select('*')` is for the row you are actually rendering
  in full. Hydrating a Property just to show its title should not ship its
  description, facilities and image list.
- **Wrap RLS helpers in a subquery.** Policies read
  `(SELECT is_member(org_id))`, not `is_member(org_id)` — the subquery form
  becomes an InitPlan evaluated once per statement instead of risking a call per
  row. This matters most on the tables that get scanned whole.
- **Index in the same migration as the column.** Every foreign key, every column
  used in a filter or an order, and `org_id` on every table. Cozy Keys' core
  tables were created by a `supabase-schema.sql` that is not in its repo, so
  nobody can tell from the source whether `rentals.property_id` is indexed —
  and it is queried on every list load.
- **All schema lives in `supabase/migrations/`.** No SQL applied by hand, no
  schema file outside the migration sequence.

## Security

The whole product rests on one agency never seeing another's books. ADR 0001 and
ADR 0002 are the shape of that; these are the rules that keep it true.

- **The Org is never taken from the request.** It is resolved server-side from
  the session plus the URL slug, and a caller without a Membership there is
  refused. An `org_id` arriving in a request body or form field is a bug.
- **Writes go through Server Actions**, each beginning by establishing
  Membership. The two exceptions are named in ADR 0002 (the nightly job, the
  Inquiry intake webhook); a third exception needs an ADR.
- **The service role key belongs to the cron job.** It never reaches a request
  handler, a Server Action, or the browser. Any new use of it is wrong until
  argued otherwise.
- **No policy grants `anon` a write.** Cozy Keys left `INSERT` on `inquiries`
  open to the anonymous role; in a shared database that is a hole into every Org.
- **Uploads are org-prefixed and verified.** Files live under `{org_id}/…` and
  `storage.objects` policies compare the first path segment against Membership.
  A failed upload fails — there is no fallback that stashes the bytes elsewhere.
- **Tenants carry identity documents.** `id_card` and its neighbours never appear
  in logs, error messages, analytics, or an LLM prompt. When an error needs to
  identify a Tenant, use the id.
- **The RLS shape test is not optional.** It reads `pg_tables` and `pg_policies`
  against a real database and fails when any table in `public` lacks RLS,
  `org_id NOT NULL`, or a policy per operation. If it is failing, the fix is the
  migration, never the allowlist.

## UX

Sala is operated, not read. People scan it for the thing that needs attention.

- **Thai UI, `ทรัพย์` for Property.** The glossary in CONTEXT.md is the code's
  vocabulary; the Thai copy is the user's. Keep the mapping consistent — do not
  invent a second Thai word for a term that already has one.
- **State reads as form, not just colour.** A pill, a chip, a stripe — so
  overdue money is findable without comparing shades. Semantic colours (ok /
  waiting / warning) stay separate from the teak accent, which means the accent
  never carries status.
- **Money is `tabular-nums`,** right-aligned, with the currency symbol. Columns
  of digits that do not line up are unreadable at a glance.
- **Dates are Asia/Bangkok, everywhere.** Use
  `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' })` for "today".
  `toISOString().slice(0, 10)` gives the wrong day during Bangkok evenings and
  has already caused bugs in the ported code.
- **Show the summary before the detail.** The counts a person came for are above
  the table, not derived by reading it.
- **Skeletons, not spinners,** for content whose shape is known — and no layout
  shift when the data lands.
- **Destructive actions say what they destroy.** Ending a Rental deletes future
  unpaid Payments; the confirmation says so, with the number.
- **Errors say what to do next.** No apologies, no raw Postgres text. A failed
  upload says the file was too large and what the limit is.
- **Both themes get built.** Light and dark are designed together, not inverted.
  Palette is in README.md.
