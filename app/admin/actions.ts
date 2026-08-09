'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase-admin'
import { ORG_RECOVERY_DAYS, parseCreateOrgForm } from '@/lib/org-input'
import { cleanText, isEmail } from '@/lib/validate'
import { requireSuperadmin } from './guard'
import type { ActionResult } from '@/lib/action-result'

// The console's writes. Every one of them starts with requireSuperadmin — not
// because the layout forgot, but because a Server Action is an HTTP endpoint and
// no layout runs in front of one. tests/no-service-role-leak.test.ts fails the
// build if a 'use server' file under app/admin/ stops mentioning it.
//
// They touch Orgs, Memberships and auth accounts. Nothing under Inventory,
// Tenancy or Leads (ADR 0006), and no action here changes anyone's login email —
// a role that could would be a role that can take over any account in the
// system.

/** Errors say what to do next and never carry raw Postgres text (CLAUDE.md).
 *  The detail still reaches the server log, where an operator can read it. */
function failed(what: string, err: unknown): ActionResult {
  console.error(`[admin] ${what}:`, err)
  return {
    ok: false,
    message: `${what} failed. Try again — if it keeps failing, read the server log.`,
  }
}

const ROLES = new Set(['admin', 'member'])

function readRole(value: FormDataEntryValue | null): 'admin' | 'member' | null {
  const role = typeof value === 'string' ? value : ''
  return ROLES.has(role) ? (role as 'admin' | 'member') : null
}

/** The account an email address names, invited into existence if it has none.
 *
 *  Two steps rather than one because they fail differently: an address that
 *  already has an account is the common case (somebody joining a second Org),
 *  and inviting it again would be wrong. `admin_user_id_by_email` answers that
 *  in one indexed lookup instead of paging through every user.
 *
 *  Shared by addMember and createOrg — an Org's first admin arrives by exactly
 *  the same route as its tenth Member, and two copies of this would be two
 *  places for the invite's redirect to drift. Throws; the caller decides what a
 *  failure here reads like. */
async function findOrInviteAccount(
  supabase: ReturnType<typeof createAdminClient>,
  email: string,
  slug: string,
): Promise<{ userId: string; invited: boolean }> {
  const { data: existing, error } = await supabase.rpc('admin_user_id_by_email', {
    p_email: email,
  })
  if (error) throw error
  if (existing) return { userId: existing as string, invited: false }

  // Creates the account and emails them. The link in that mail lands on
  // /auth/confirm, which verifies server-side — an invite is not started by
  // the recipient's browser, so it has no PKCE verifier and cannot go
  // through /auth/callback.
  const { data, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${await originUrl()}/auth/confirm?next=/o/${slug}`,
  })
  if (inviteError) throw inviteError
  if (!data.user) throw new Error('invite returned no user')
  return { userId: data.user.id, invited: true }
}

/** Add somebody to an Org, creating their account first if they have none. */
export async function addMember(formData: FormData): Promise<ActionResult> {
  await requireSuperadmin()

  const orgId = cleanText(formData.get('org_id'), 40)
  const slug = cleanText(formData.get('slug'), 40)
  const email = cleanText(formData.get('email'), 254).toLowerCase()
  const displayName = cleanText(formData.get('display_name'), 80)
  const role = readRole(formData.get('role'))

  if (!orgId || !slug) {
    return { ok: false, message: 'No Org to add anyone to. Go back to the list and open it again.' }
  }
  if (!isEmail(email)) return { ok: false, message: 'That email is not valid. Check it and enter it again.' }
  if (!role) return { ok: false, message: 'Choose a role — Admin or Member.' }

  const supabase = createAdminClient()

  let userId: string
  let invited = false
  try {
    ;({ userId, invited } = await findOrInviteAccount(supabase, email, slug))
  } catch (err) {
    return failed('Creating the account', err)
  }

  try {
    const { error } = await supabase.from('memberships').insert({
      org_id: orgId,
      user_id: userId,
      role,
      display_name: displayName || null,
    })
    if (error) {
      // The composite primary key is (org_id, user_id).
      if (error.code === '23505') {
        return { ok: false, message: 'This person is already in this Org.' }
      }
      throw error
    }
  } catch (err) {
    return failed('Adding the Member', err)
  }

  revalidatePath(`/admin/orgs/${slug}`)
  revalidatePath('/admin')
  return {
    ok: true,
    message: invited
      ? `Added ${email} and sent an invitation email. If it does not arrive, they can ask for a link themselves from the login page.`
      : `Added ${email}. This account already existed, so they can log in straight away.`,
  }
}

export async function setMemberRole(formData: FormData): Promise<ActionResult> {
  await requireSuperadmin()

  const orgId = cleanText(formData.get('org_id'), 40)
  const slug = cleanText(formData.get('slug'), 40)
  const userId = cleanText(formData.get('user_id'), 40)
  const role = readRole(formData.get('role'))

  if (!orgId || !userId || !role) return { ok: false, message: 'That request was incomplete. Try again.' }

  const supabase = createAdminClient()
  try {
    if (role === 'member') {
      const blocked = await wouldStrandOrg(orgId, userId)
      if (blocked) return blocked
    }

    const { error } = await supabase
      .from('memberships')
      .update({ role })
      .eq('org_id', orgId)
      .eq('user_id', userId)
    if (error) throw error
  } catch (err) {
    return failed('Changing the role', err)
  }

  revalidatePath(`/admin/orgs/${slug}`)
  return { ok: true, message: role === 'admin' ? 'Now an Admin.' : 'Now a Member.' }
}

export async function setMemberDisplayName(formData: FormData): Promise<ActionResult> {
  await requireSuperadmin()

  const orgId = cleanText(formData.get('org_id'), 40)
  const slug = cleanText(formData.get('slug'), 40)
  const userId = cleanText(formData.get('user_id'), 40)
  const name = cleanText(formData.get('display_name'), 80)

  if (!orgId || !userId) return { ok: false, message: 'That request was incomplete. Try again.' }

  const supabase = createAdminClient()
  try {
    const { error } = await supabase
      .from('memberships')
      // Blank clears it and the list falls back to the email, rather than
      // storing a string that renders as an empty cell.
      .update({ display_name: name || null })
      .eq('org_id', orgId)
      .eq('user_id', userId)
    if (error) throw error
  } catch (err) {
    return failed('Changing the name', err)
  }

  revalidatePath(`/admin/orgs/${slug}`)
  return {
    ok: true,
    message: name ? `Renamed to ${name}.` : 'Name cleared — the email shows instead.',
  }
}

/** Removes the Membership and leaves the account alone — the only removal that
 *  is reversible, and the only one inside ADR 0006's scope. Deleting the account
 *  would reach into every other Org this person belongs to. */
export async function removeMember(formData: FormData): Promise<ActionResult> {
  await requireSuperadmin()

  const orgId = cleanText(formData.get('org_id'), 40)
  const slug = cleanText(formData.get('slug'), 40)
  const userId = cleanText(formData.get('user_id'), 40)

  if (!orgId || !userId) return { ok: false, message: 'That request was incomplete. Try again.' }

  const supabase = createAdminClient()
  try {
    const blocked = await wouldStrandOrg(orgId, userId)
    if (blocked) return blocked

    const { error } = await supabase
      .from('memberships')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', userId)
    if (error) throw error
  } catch (err) {
    return failed('Removing the Member', err)
  }

  revalidatePath(`/admin/orgs/${slug}`)
  revalidatePath('/admin')
  return { ok: true, message: 'Removed from the Org. The account itself still exists.' }
}

// ─── The Org life cycle ──────────────────────────────────────────────────────
// Superadmin-only, and unreachable from inside an Org by construction: a
// soft-deleted Org fails is_member() for everyone in it, so nobody there can
// see the row a restore would act on, let alone post to one of these. All three
// go through createAdminClient() for that reason — the service role is the only
// caller RLS is not hiding the row from (ADR 0010).

/** Create an Org and invite its first admin, in that order.
 *
 *  One action rather than two because an Org nobody can log into is not a
 *  useful thing to have made. If the second half fails the Org still exists
 *  with nobody in it — the console renders that state already, and addMember
 *  repairs it — so the message says so rather than pretending nothing
 *  happened. Undoing the insert would be a compensating write that can fail in
 *  its own turn, leaving a worse story to tell. */
export async function createOrg(formData: FormData): Promise<ActionResult> {
  await requireSuperadmin()

  const parsed = parseCreateOrgForm(formData)
  if (!parsed.ok) return { ok: false, message: parsed.message }
  const { slug, name, email, display_name } = parsed.values

  const supabase = createAdminClient()

  let orgId: string
  try {
    const { data, error } = await supabase
      .from('orgs')
      .insert({ slug, name })
      .select('id')
      .single()
    if (error) {
      // slug is UNIQUE, and stays reserved by a soft-deleted Org for the whole
      // recovery window — the row is still there, so the constraint still
      // holds against it (ADR 0010).
      if (error.code === '23505') {
        return { ok: false, message: `That URL is already taken. Choose another.` }
      }
      throw error
    }
    orgId = data.id
  } catch (err) {
    return failed('Creating the Org', err)
  }

  let userId: string
  let invited = false
  try {
    ;({ userId, invited } = await findOrInviteAccount(supabase, email, slug))
  } catch (err) {
    revalidatePath('/admin')
    console.error('[admin] Inviting the first Admin:', err)
    return {
      ok: false,
      message:
        `${name} was created, but ${email} could not be invited. ` +
        `Open the Org and add them from there.`,
    }
  }

  try {
    const { error } = await supabase.from('memberships').insert({
      org_id: orgId,
      user_id: userId,
      role: 'admin',
      display_name,
    })
    if (error) throw error
  } catch (err) {
    revalidatePath('/admin')
    console.error('[admin] Adding the first Admin:', err)
    return {
      ok: false,
      message:
        `${name} was created, but ${email} was not added to it. ` +
        `Open the Org and add them from there.`,
    }
  }

  revalidatePath('/admin')
  revalidatePath(`/admin/orgs/${slug}`)
  return {
    ok: true,
    message: invited
      ? `Created ${name} at /o/${slug} and sent ${email} an invitation email. If it does not arrive, they can ask for a link themselves from the login page.`
      : `Created ${name} at /o/${slug} with ${email} as its Admin. This account already existed, so they can log in straight away.`,
  }
}

/** Cut an Org off now, keep it recoverable for ORG_RECOVERY_DAYS.
 *
 *  Setting `deleted_at` is the whole of it: is_member() reads the column, so
 *  every Member of this Org loses every table in the same statement, with no
 *  read-only grace mode to keep correct alongside the real one. Nothing is
 *  destroyed here — scripts/purge-deleted-orgs.mjs does that, later, by hand. */
export async function softDeleteOrg(formData: FormData): Promise<ActionResult> {
  await requireSuperadmin()

  const orgId = cleanText(formData.get('org_id'), 40)
  const slug = cleanText(formData.get('slug'), 40)
  if (!orgId) return { ok: false, message: 'That request was incomplete. Try again.' }

  let org: { name: string } | null
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('orgs')
      // The clock that decides the 60 days is Postgres's, read by the purge
      // script; this stamp only has to be close enough to it to order the
      // list, so a request-time timestamp is fine here.
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', orgId)
      // Makes a second click a no-op instead of restarting the window.
      .is('deleted_at', null)
      .select('name')
      .maybeSingle()
    if (error) throw error
    org = data
  } catch (err) {
    return failed('Removing the Org', err)
  }

  if (!org) {
    return {
      ok: false,
      message: 'Nothing to remove — that Org is already scheduled for deletion, or no longer exists.',
    }
  }

  revalidatePath('/admin')
  if (slug) revalidatePath(`/admin/orgs/${slug}`)
  return {
    ok: true,
    message:
      `${org.name} is closed to its Members from now on. You can restore it for ` +
      `${ORG_RECOVERY_DAYS} days; after that it is purged along with everything in it.`,
  }
}

/** Put a soft-deleted Org back. Superadmin-only and with no alternative to
 *  consider: nobody inside the Org can reach this, because nobody inside the
 *  Org can see that it still exists. */
export async function restoreOrg(formData: FormData): Promise<ActionResult> {
  await requireSuperadmin()

  const orgId = cleanText(formData.get('org_id'), 40)
  const slug = cleanText(formData.get('slug'), 40)
  if (!orgId) return { ok: false, message: 'That request was incomplete. Try again.' }

  let org: { name: string } | null
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('orgs')
      .update({ deleted_at: null })
      .eq('id', orgId)
      .not('deleted_at', 'is', null)
      .select('name')
      .maybeSingle()
    if (error) throw error
    org = data
  } catch (err) {
    return failed('Restoring the Org', err)
  }

  if (!org) {
    return {
      ok: false,
      message: 'Nothing to restore — that Org is not scheduled for deletion, or no longer exists.',
    }
  }

  revalidatePath('/admin')
  if (slug) revalidatePath(`/admin/orgs/${slug}`)
  return { ok: true, message: `${org.name} is back. Its Members can reach it again, with nothing lost.` }
}

/** Refuses the change that would leave an Org with no admin. Such an Org still
 *  works for its Members, but nobody inside it can add or remove anyone again —
 *  only an operator could repair it, and the repair is invisible from the Org's
 *  own screens. Cheaper to refuse than to explain later. */
async function wouldStrandOrg(orgId: string, userId: string): Promise<ActionResult | null> {
  const supabase = createAdminClient()

  const { data: admins, error } = await supabase.rpc('admin_admin_count', { p_org: orgId })
  if (error) throw error
  if ((admins as number) > 1) return null

  const { data: target, error: targetError } = await supabase
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()
  if (targetError) throw targetError
  if (target?.role !== 'admin') return null

  return {
    ok: false,
    message: 'This is the last Admin of the Org. Make somebody else an Admin first, then do this.',
  }
}

/** The origin an invite link should come back to. Read from the request rather
 *  than hardcoded, so a link generated in development does not point at
 *  production — and vice versa. */
async function originUrl(): Promise<string> {
  const { headers } = await import('next/headers')
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}
