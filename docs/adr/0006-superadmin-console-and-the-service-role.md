# The Superadmin console, and the third service-role exception

Somebody has to create the first Membership in a new Org, and until now that
somebody opened the Supabase SQL editor. ADR 0002 left it there deliberately —
there was no write path at all, so a console would have been the first one. There
is one now, and doing Membership by hand does not survive the second agency.

CONTEXT.md already names the role: **Superadmin**, the operator of Sala, who
creates Orgs and invites their first owner, sitting outside every Org and holding
no Membership in any. This is that definition given code.

## What a Superadmin may touch

Orgs and Memberships. Nothing else.

Not Properties, Rentals, Payments, Tenants, Inquiries or documents — not a
listing, not a count, not a support lookup. ADR 0001 says the whole product rests
on one agency never seeing another's books, and a console that reads them is that
promise with an asterisk. The line is drawn at the vocabulary boundary in
CONTEXT.md: everything under "Organisation" is the operator's, everything under
"Inventory", "Tenancy" and "Leads and paperwork" belongs to the Org and is
reachable only by its Members.

The Superadmin does not get a way to read an Org's data quietly. If one is ever
needed, it is a new ADR with an audit trail attached, not a widening of this one.

## Who is a Superadmin

An allowlist of user ids in the server environment, `SALA_SUPERADMIN_USER_IDS`.

Not a table. A `superadmins` table in `public` would have to carry
`org_id NOT NULL` and four policies to satisfy the shape test, which is
incoherent for a role defined by being outside every Org, and the alternative —
adding it to that test's allowlist — is the move CLAUDE.md forbids by name. A
table in another schema would dodge the test rather than answer it, and would put
"who is the operator" inside the same database the operator administers.

Not a JWT claim either. `app_metadata` rides in the access token, so revoking it
leaves the removed operator holding a valid superadmin token until the token
expires. An environment read happens on every request.

The cost is honest and accepted: adding or removing a Superadmin is an
environment change and a redeploy. That is the correct friction for the shortest
path to every agency's data, and it is not an operation that should be available
to somebody who has just taken over a session.

## The service role key, and why this is the third exception

CLAUDE.md: the service role key belongs to the cron job, never reaches a request
handler, a Server Action or the browser, and any new use is wrong until argued
otherwise. ADR 0002 names two exceptions to Membership-first writes — the nightly
job and the Inquiry intake webhook. This is the third, and the argument is that
the work is not doable without it:

- A Superadmin holds no Membership, so every RLS policy on `memberships` and
  `orgs` refuses them. Reading the console's own screens is already impossible
  as `authenticated`.
- Creating an account for somebody who has none is `auth.admin`, which exists
  only for the service role. There is no anon-key path that does not also let a
  stranger mint accounts, which is the hole `shouldCreateUser: false` closes on
  the sign-in form.

So the exception is granted, and bounded in four ways that are checkable rather
than aspirational:

1. One module holds the key, `lib/supabase-admin.ts`, and it is `server-only`.
2. `tests/no-service-role-leak.test.ts` reads the source tree and fails if any
   file outside `app/admin/` and `lib/supabase-admin.ts` imports it, and if the
   key's name appears with a `NEXT_PUBLIC_` prefix anywhere.
3. Every Server Action in `app/admin/` re-checks `isSuperadmin` as its first
   statement. The layout gate is for the person; the action check is the one that
   matters, because an action is an HTTP endpoint that no layout runs in front of.
4. The queries it may issue are Orgs, Memberships and `auth.admin` — the scope
   above. This one is a rule, not a mechanism: the key itself cannot be narrowed,
   which is exactly why the other three are mechanical.

The console's four reads are SECURITY DEFINER with no guard inside them, because
there is nothing for them to check — a Superadmin holds no Membership. Their
`GRANT` to `service_role` is the entire access control, so `schema-shape.test.ts`
asserts it from the catalog: `anon` and `authenticated` must hold no EXECUTE on
any of the four, and `service_role` must hold it on all four.

That assertion exists because this went wrong first. `REVOKE ALL ON FUNCTION f
FROM public` does not remove the grants Supabase's default privileges hand to
`anon` and `authenticated` *as roles* — `PUBLIC` is a different grantee with a
confusingly similar name — so 0006 shipped `admin_org_members` callable by
anyone holding the publishable key. 0007 corrects it. The lesson is not "be
careful with REVOKE"; it is that a privilege has to be read back from the
catalog, never inferred from the SQL that was meant to produce it.

A caller who is signed in but not a Superadmin gets a 404 from `/admin`, not a
403 — the same non-disclosure `NotAMemberError` already uses. Whether a console
exists is not something the console should confirm.

## Names and email addresses

Members get a `display_name`, and it lives on `memberships` rather than on the
person. Two reasons, and the second is the better one. A per-person profile table
in `public` hits the same `org_id NOT NULL` wall as `superadmins` above. And a
name on the Membership stays inside the Org boundary: an agency learns what a
person calls themselves *there*, and not what they call themselves at a
competitor.

Reading it back needs a function. `auth.users` is not in the PostgREST schema and
must not be, so `org_members(p_org)` is SECURITY DEFINER, gated on
`is_member(p_org)`, and returns exactly the four things a member list shows.

Changing your own name is `set_my_display_name(p_org, p_name)`, also DEFINER, and
also not a policy. RLS decides rows, not columns: a policy permitting
`user_id = auth.uid()` to UPDATE its own Membership row would permit that row's
`role` column too, and every member could promote themselves to `owner`. The
function writes one column, and that is the whole reason it is a function.

Email stays in `auth.users` and is changed by its owner through
`auth.updateUser({ email })`, which confirms at both addresses. A Superadmin
cannot change somebody else's login email. Being able to would mean that whoever
holds this role can silently take over any account in the system, and the point
of writing the scope down is to keep it smaller than what the key permits.

## Consequences

`owner` keeps what CONTEXT.md gives it — an Org's owner still adds and removes
Members inside their own Org, through RLS, with no service role anywhere near it.
Superadmin is a second way in for the operator, not a replacement, and the two
must not drift into disagreeing about what a Role means.

Removing somebody removes the Membership and leaves the account. It is the only
form of removal that is reversible and the only one that stays inside this ADR's
scope: deleting an account would reach into every other Org that person belongs
to, and would strand the `user_id` recorded against their Memberships elsewhere.

`/admin` is now the highest-value target in the application. It holds the one
credential that RLS does not constrain, which is the argument for the source-scan
test rather than a comment asking people to be careful.
