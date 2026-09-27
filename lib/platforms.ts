// Reading Platforms — the places an Org advertises its Properties.
//
// Two readers with different jobs, the same split as lib/buildings.ts:
//   * `listActivePlatforms` fills the tick-list on the Property form. Two
//     columns, bounded, active only — a channel the Org has retired should not
//     be offered again.
//   * `listPlatforms` is the management page: the same rows plus how many
//     Postings name each one, counted in Postgres (CLAUDE.md) rather than by
//     downloading Postings and grouping them here.
//
// Both are org-scoped through `requireMember`'s Org id, with RLS behind that.

import { createClient } from './supabase-server'

/** A hard bound rather than no bound (CLAUDE.md). An agency advertises in a
 *  handful of places; a hundred is far past "more channels than anyone has"
 *  and still a number the query cannot exceed. */
export const PLATFORMS_LIMIT = 100

export interface PlatformOption {
  id: string
  name: string
}

export async function listActivePlatforms(
  orgId: string,
): Promise<{ options: PlatformOption[]; capped: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('platforms')
    .select('id, name')
    .eq('org_id', orgId)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
    .limit(PLATFORMS_LIMIT)
  if (error) throw error

  const rows = (data ?? []) as { id: string; name: string }[]
  return {
    options: rows.map((p) => ({ id: p.id, name: p.name })),
    capped: rows.length === PLATFORMS_LIMIT,
  }
}

export interface PlatformRow extends PlatformOption {
  sortOrder: number
  active: boolean
  /** How many Postings name this Platform. What retiring it would hide, and
   *  why the database refuses to delete it (ON DELETE RESTRICT, 0011). */
  postingCount: number
}

/**
 * Every Platform an Org has, retired ones included.
 *
 * No cursor and no search, deliberately: `PLATFORMS_LIMIT` sits below one
 * page, so a pager would be furniture and a search box would be a control for
 * scanning a list you can already see. This is not an oversight — do not
 * "fix" it by copying the keyset shape from `listBuildings`.
 */
export async function listPlatforms(orgId: string): Promise<PlatformRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('platforms')
    .select('id, name, sort_order, active, postings(count)')
    .eq('org_id', orgId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
    .limit(PLATFORMS_LIMIT)
  if (error) throw error

  const rows = (data ?? []) as {
    id: string
    name: string
    sort_order: number
    active: boolean
    postings: { count: number }[] | null
  }[]

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    sortOrder: p.sort_order,
    active: p.active,
    postingCount: p.postings?.[0]?.count ?? 0,
  }))
}

/** The ids among `platformIds` that really belong to this Org, read as the
 *  caller so RLS is what refuses a foreign one. `savePostings` compares the
 *  result against what it was given rather than trusting a posted id — the
 *  same discipline as `ownerBelongsToOrg`. */
export async function ownedPlatformIds(orgId: string, platformIds: string[]): Promise<Set<string>> {
  if (platformIds.length === 0) return new Set()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('platforms')
    .select('id')
    .eq('org_id', orgId)
    .in('id', platformIds)
  if (error) throw error
  return new Set(((data ?? []) as { id: string }[]).map((p) => p.id))
}
