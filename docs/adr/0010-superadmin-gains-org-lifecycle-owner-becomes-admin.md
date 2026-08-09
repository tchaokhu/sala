# Superadmin gains Org lifecycle, and the `owner` Role becomes `admin`

Two decisions, settled together via `/grilling` because they arrived as one
request: Superadmin (`app/admin/`) needs to create and remove Orgs, not just
manage Members inside Orgs that already exist, and along the way `owner`
becomes `admin`.

## `owner` the Role becomes `admin`

Pure rename, not a new capability. `admin` keeps exactly `owner`'s two powers —
invite/remove Members, edit the Org — applied to the `org_role` enum
(`0001_init.sql:35`), `is_org_owner()` → `is_org_admin()`
(`0001_init.sql:61-69`), every RLS policy and RPC that names the role
(`admin_owner_count`, `admin_orgs`'s `owner_count`, both in
`0006_member_admin.sql`), every Server Action, and every UI string. `member` is
untouched.

The reason is CONTEXT.md's own glossary, which already carries a footnote
disambiguating the Role from the real-estate term: "**Owner**: The person who
owns a Property... Distinct from the `owner` Role, which is about Sala itself
and has nothing to do with real estate." CLAUDE.md says not to invent a second
English word for a concept that already has one — here it is the mirror image
of that mistake: two unrelated concepts were sharing one word, and the
footnote already existed to manage the confusion. Removing the collision
removes the need for the footnote.

## Superadmin creates and removes Orgs

Until now, `/admin` could manage Memberships inside an Org that already
existed; creating one meant the Supabase SQL editor (`app/admin/page.tsx`'s
empty state says so directly), and there was no way to remove one at all. That
gap does not survive a second agency being onboarded without a hand-written
`INSERT`.

**Create bundles the first admin**, the same shape `addMember` already uses. A
Superadmin creating an Org that nobody can log into isn't useful, so
`createOrg` creates the `orgs` row and invites its first `admin` Member in one
Server Action — reusing `addMember`'s (`app/admin/actions.ts:41-111`)
"look up or invite the account, then insert the Membership" shape rather than
duplicating it.

**Removal is soft, with a 60-day recovery window — deliberately unlike
Property.** ADR 0009 rejected a soft-delete/archive column for Property: no
domain concept for it, no existing pattern to be consistent with, nobody
asking for it. None of those three hold at the Org level anymore. There is a
pattern now — this ADR is it — and somebody has asked, because an Org's blast
radius is not a Property's. `ON DELETE RESTRICT` is right where "no history
yet" is the common case and clears with tidying up; an Org carries at least
one Membership from the moment it exists, so the same rule would make Org
deletion permanently unusable rather than a hurdle. The account taking the
risk is smaller too — Property delete is reachable by any Member of the Org it
belongs to, where Org delete is reachable only by a Superadmin, the same
operator ADR 0006 already trusts with `auth.admin` and the service role.

Soft-delete cuts access off immediately rather than leaving a grace-period
read-only mode. `is_member(p_org)` (`0001_init.sql:51-59`) — the single choke
point every table's generic RLS policy already calls through
`(SELECT is_member(org_id))`, per that migration's own header comment — gains
one clause: `AND NOT EXISTS (SELECT 1 FROM orgs WHERE id = p_org AND
deleted_at IS NOT NULL)`. One function change, every table, no per-policy
edits. `orgs_member_read` (`0001_init.sql:321-322`) calls the same function
for the Org's own row, so a soft-deleted Org disappears from its Members'
view identically — `requireMember` starts reporting `NotAMemberError` for a
soft-deleted Org exactly as it would for an Org the caller never belonged to,
with no separate code path to keep correct.

Restore is Superadmin-only, and there is no alternative to consider: nobody
inside the Org can reach a restore action, because nobody inside the Org can
see it anymore.

Sixty days out, purge is a plain callable script, not a scheduled job. This
codebase has no nightly job yet — ADR 0001 and ADR 0002 both describe one in
prose (Rental expiry), and neither has ever been wired to a scheduler. This
ADR does not invent one just for Org purge. `scripts/purge-deleted-orgs.mjs`
follows `scripts/db-apply-remote.mjs`'s shape: something a human runs, until a
real deployment target exists and picks a scheduling mechanism, at which
point Org purge and Rental expiry move onto it together.

## Consequences

The Storage sweep for a purged Org reuses `discard()`'s best-effort shape
(`lib/property-storage.ts:23-30`) at the Org's `{org_id}/` prefix, run
*before* the row's delete — the reverse of Property delete's ordering, and
deliberately so: Property delete sweeps Storage only after the row commits,
because a blocked delete must never touch Storage. An Org purge has no
`RESTRICT` to fail on, so there is nothing left to reverse for; sweeping first
means a script that dies partway through leaves an orphaned Storage object,
not an `orgs` row pointing at Storage that's already gone.

A soft-deleted Org's `slug` stays reserved for the full 60 days — the row is
still there, and `slug UNIQUE` still holds against it. Reusing a slug before
purge is not supported; this is a corner nobody has hit yet, the same way ADR
0009 left Property archival as a future problem rather than solving one
nobody had brought.

`admin_owner_count` (`0006_member_admin.sql:133-142`), the RPC behind the
last-admin guard in `app/admin/actions.ts`'s `wouldStrandOrg`, is renamed
alongside the role it counts — an Org must always keep at least one `admin`,
same guarantee, new name.
