# Property photos upload through the Server Action, and the row is written last

Creating a Property is the first write in Sala that moves bytes as well as rows.
[0002](./0002-writes-through-server-actions.md) settles who may write and how the
Org is established; it does not say where an upload happens, and the obvious
implementation — hand the browser a Supabase client and let it put the file in
the bucket — is the Cozy Keys habit that ADR wrote itself against.

**The files travel inside `createProperty`.** They arrive in the action's
`FormData`, and the action uploads them with the request-scoped client
(`createClient()` — the caller's session, the anon key), so `storage.objects`
policies check Membership against the `{org_id}` prefix exactly as they were
written to. The action has already run `requireMember`, so a caller with no
Membership in the Org named by the slug is refused before a byte is stored.

Uploading from the browser client was rejected: it is a write from an untrusted
client, which is a fourth exception to 0002 and would need its own argument, and
it buys nothing here — the form is already posting to a Server Action, so the
bytes have somewhere to go. A presigned upload URL minted server-side was
rejected for the same reason plus a second: it is a second code path that has to
be kept in step with the first, for a form that uploads at most eight files.

**The row is written after the objects, not before.** `createProperty` mints the
Property's id with `crypto.randomUUID()`, so `{org_id}/{property_id}/{n}.{ext}`
is known before the row exists. Photos go up; only if all of them land does the
insert happen. Insert-first was rejected because its failure mode is a Property
whose `images` array points at bytes that never arrived — a broken record that
looks fine in the list and fails at the moment somebody opens it. This ordering's
own failure mode is objects under a prefix no row references, which nothing but
storage cost notices; both failure paths sweep them best-effort, and a sweep that
itself fails is logged rather than reported, because the person's answer is
already decided.

Storage keys never reuse the uploaded filename. They are `{n}.{ext}`, with the
extension derived from the mime type Sala accepts, so nothing from somebody's
desktop ends up in a path that every Member of the Org can read.

## Consequences

`next.config.ts` carries `experimental.serverActions.bodySizeLimit`. A submission
is one request body, and Next's default is 1 MB — two photos from a phone. The
limit is set above the 20 MB batch `lib/property-input.ts` allows, and the two
numbers move together or uploads start failing at a size the form said was fine.

The limits are stated twice on purpose and in one place in the source: the form
runs `validateImages` before submitting so nine files or a 6 MB one is refused
without crossing the network, and the action runs the same function on what
actually arrived, because the browser's check is a courtesy and not a control.
The bucket's own `file_size_limit` and `allowed_mime_types`
(`0002_storage.sql`) remain the backstop.

Nothing renders a Property's photos yet. The bucket is private, so display needs
signed URLs, and there is no Property detail page to put them on. Uploaded
photos are stored and referenced correctly and are invisible until that page
exists; the form previews them locally before submit and the list says how many
were saved, so the gap is visible to whoever hits it rather than silent.

The local test database has no `storage` schema — `0002_storage.sql` no-ops
there — so no automated test covers the upload path. `tests/rls/property-create.test.ts`
covers the row half against real policies; the object half is verified against
the project by hand, which is what the verification steps in this feature's plan
are for.
