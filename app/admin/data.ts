import 'server-only'

import { createAdminClient } from '@/lib/supabase-admin'
import type { AdminMember, AdminOrg } from './types'

export type { AdminMember, AdminOrg }

// The console's reads. All four are RPCs granted to service_role and nothing
// else (0006_member_admin.sql) — a Superadmin holds no Membership, so every
// policy in the database refuses them and the ordinary member-facing reads
// return nothing. See ADR 0006 for why that is the right shape rather than a
// bypass bolted into the policies.
//
// Orgs and Memberships only. There is no listing here for Properties, Rentals,
// Payments or Tenants, and adding one is a new ADR rather than a new function.

export async function listOrgs(limit = 50): Promise<AdminOrg[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('admin_orgs', { p_limit: limit })
  if (error) throw error
  return (data ?? []) as AdminOrg[]
}

/** The Org a slug names, without any Membership check — that is the point of
 *  this file. Columns are named, never '*'.
 *
 *  `deleted_at` comes back too: a soft-deleted Org is visible to nobody but the
 *  service role (ADR 0010), so this read is the only place the console can
 *  learn that the Org it is about to render is one waiting to be purged. */
export async function adminOrgBySlug(
  slug: string,
): Promise<{ id: string; slug: string; name: string; deleted_at: string | null } | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('orgs')
    .select('id, slug, name, deleted_at')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function listMembers(orgId: string): Promise<AdminMember[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('admin_org_members', { p_org: orgId })
  if (error) throw error
  return (data ?? []) as AdminMember[]
}
