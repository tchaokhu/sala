# Summary numbers are one SECURITY INVOKER function, read on the server

The Org landing page shows four numbers: Properties on the books, active
Rentals, Rentals ending this calendar month, and baht overdue. Getting them the
obvious way costs four round-trips, and the baht figure cannot be had at all
through PostgREST's count interface — a sum means either an aggregate in SQL or
downloading every unsettled Payment and reducing over it in the browser. The
second is what Cozy Keys' dashboard does, and it is the reason that page feels
slow.

So the four numbers are one function, `org_dashboard(p_org uuid, p_today date)`,
returning a single row. One statement, one trip, and the arithmetic stays in
Postgres where the indexes are.

It is **SECURITY INVOKER** — unlike `is_member()` and `create_inquiry_via_token()`,
which are DEFINER for reasons particular to each. Running as the caller means
every subquery inside it is filtered by the same policies a direct `SELECT`
would meet: hand it another Org's id and it returns zeros, because RLS admits no
rows, not because the function checked. A DEFINER function here would be a hole
into every Org's books wide enough to drive ADR 0001 through, and it would look
exactly like this one in the source. `tests/rls/dashboard.test.ts` asserts the
zeros, and flipping the function to DEFINER makes three of its cases fail.

`p_today` is a parameter, not `now()`. The product's day is Asia/Bangkok
(CLAUDE.md) and the server's clock is UTC; on the same evening the two disagree
about which month a Rental ends in. One definition of today, in `lib/dates.ts`,
handed in at the call site.

## This amends ADR 0002 on reads

ADR 0002 said writes move to Server Actions while **reads stay on the browser
client**, on the grounds that the list-and-filter code already worked there. For
these reads that is no longer true and the clause does not survive: a browser
read cannot produce a sum without shipping the rows to compute it, and a page
that starts fetching after its bundle hydrates is slower than one that fetches
during the render. Org-scoped reads are Server Component reads, gated by
`requireMember` and backed by RLS.

What ADR 0002 decided about *writes* is untouched — Server Actions, Membership
first, the two named exceptions.

## Consequences

Every future summary follows this shape rather than accumulating count queries
beside it: a tile that needs a number the function does not return is a change
to `0003_org_dashboard.sql`, not a second query in the page. Detail lists stay
ordinary bounded `SELECT`s — the RPC is for aggregates, not for hiding queries
behind names.

`requireMember` and `currentUser` are memoised per request (React `cache`), so
the layout's gate and a page that needs the Org's id share one pair of
round-trips. The memo is render-scoped, not session-scoped: the next request
re-establishes Membership from scratch, so the gate never serves a stale
verdict.
