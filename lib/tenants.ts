// Reading Tenants for the Rental form's picker.
//
// Tenants carry identity documents (CONTEXT.md), so every select here names its
// columns and none of them is `id_card` — or its neighbours, `address` and
// `emergency_contact`. The picker needs a name and the phone that tells two
// people with the same name apart, and nothing more.

import { createClient } from './supabase-server'

/** A bound rather than no bound; `capped` is what the form says out loud when
 *  it is reached. Its own constant — Tenants grow faster than Buildings. */
export const TENANT_OPTIONS_LIMIT = 500

export interface TenantOption {
  id: string
  name: string
  phone: string | null
}

export async function listTenantOptions(
  orgId: string,
): Promise<{ options: TenantOption[]; capped: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, phone')
    .eq('org_id', orgId)
    .order('name', { ascending: true })
    .limit(TENANT_OPTIONS_LIMIT)
  if (error) throw error

  const options = (data ?? []) as TenantOption[]
  return { options, capped: options.length === TENANT_OPTIONS_LIMIT }
}

/** The check a write makes before it stores a tenant_id that arrived in a form
 *  — same shape as `ownerBelongsToOrg`. Another Org's Tenant finds no row. */
export async function tenantBelongsToOrg(orgId: string, tenantId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  return data !== null
}
