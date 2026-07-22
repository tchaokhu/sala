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
sets the floor for v1: inventory, rentals, payments, documents and inquiries. The
post generator is the one piece deliberately left behind for now, so v1 carries no
dependency on Gemini.

Cozy Keys' brand does not come with the data. Sala's palette and mark are its own
precisely so that the second agency to log in does not find itself inside a
competitor's product.
