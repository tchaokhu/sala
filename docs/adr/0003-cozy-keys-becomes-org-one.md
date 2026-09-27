# Cozy Keys becomes the first Org, and its repo is retired

Sala exists because The Cozy Keys' back-office turned out to be worth running for
more than one agency. Rather than keep two systems, we treat Sala as the superset:
Cozy Keys' data is migrated in as the first Org and `the-cozy-keys` is archived
once that is done. Running both would mean maintaining the same rental and
payment logic twice, and the two copies would drift within months.

Cozy Keys gets no special treatment in the schema, the policies or the UI. It is
Org number one by history only — there is no privileged Org, and any code that
would need one is a design error.

## Consequences

Sala must absorb everything Cozy Keys does before the archive can happen, which
sets the floor for v1: inventory, rentals, payments, documents, inquiries, and the
record of where each Property has been advertised. That last item was missing from
this list when it was first written — see the amendment below.

The distinction that matters is generator, not ledger. Cozy Keys wrote the
advertisement text itself: `post_templates` and the Gemini call behind
`facebook-post`. That is the piece deliberately left behind, so v1 carries no
dependency on Gemini. Keeping a tick-list of "posted to Livinginsider, here is the
link" is hand-kept bookkeeping — no model, no integration, nothing to break — and
it answers the question an agency actually asks, which is not "where is this room
posted" but "which of my rooms is nobody marketing at all".
`posting_platforms` and `property_postings` come across, as `platforms` and
`postings`. `chat_logs` does not: it
is the LINE bot's transcript, and the bot is not part of v1.

Neither table carries an `org_id` in Cozy Keys, so neither arrives unchanged. In
Sala both take `org_id uuid NOT NULL`, an index on it, RLS and a policy per
operation like every other table (0001). Each Org keeps its own list of channels
the way each Org keeps its own Buildings — two agencies both posting to
Livinginsider hold a row each.

Cozy Keys' brand does not come with the data. Sala's palette and mark are its own
precisely so that the second agency to log in does not find itself inside a
competitor's product.

## Amended, 2026-08-23

The v1 floor above originally read "inventory, rentals, payments, documents and
inquiries", and named the post generator as the single omission. The posting
ledger was neither included nor excluded — it went unmentioned, and would have
been dropped by silence when the old project is archived and its rows become
unrecoverable. It is in scope. The generator still is not. Nothing else about this
decision changed.
