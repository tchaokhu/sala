# Writes go through Server Actions; reads stay on the browser client

> **Amended by [ADR 0005](./0005-dashboard-aggregates-as-invoker-rpc.md):**
> Org-scoped reads moved to the server too. The decision about writes stands.

The Cozy Keys codebase this one grows out of does all its CRUD from the browser
through a Supabase client, leaving RLS as the only thing between a user and the
data. In a single-agency tool a gap there is an internal accident; in Sala it is
one agency reading another's books. So writes move server-side: every insert,
update and delete is a `'use server'` action whose first line establishes the
caller's Membership in the target Org, and RLS backs it up as a second check.
Reads keep going straight from the browser, because that is where the
list-and-filter code already works and a read is the half we are willing to
defend with one layer.

The asymmetry is deliberate — a reader who finds `getProperties()` running in the
browser next to `createRental()` running on the server should not "fix" it.

## Consequences

The Org a write lands in is never taken from the client. It is resolved on the
server from the session and the Org slug in the URL, and the resolution fails
closed when the caller holds no Membership there — so a hand-typed
`/o/some-other-agency/...` is refused rather than trusted. `org_id NOT NULL` plus
the RLS `WITH CHECK` clause means a write that forgets to set the Org errors
loudly instead of writing somewhere wrong.

Inquiries arrive from machines — a LINE bot, an automation — that hold no
Membership and no session, so they get the one write path that is neither. Each
Org issues itself a secret, and a request carrying it may create Inquiries for
that Org and nothing else. The secret is what names the Org; nothing in the
request body is trusted to. Cozy Keys did this by leaving `INSERT` on `inquiries`
open to the anonymous role, which in a shared database would let anyone holding
the public key write into any Org's records — that policy does not come across.
