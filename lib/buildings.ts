// Reading Buildings — โครงการ, the named development a Property sits in.
//
// Two readers with different jobs:
//   * `listBuildingOptions` fills the combobox on the Property form. Four small
//     columns, bounded, and the map link comes with it so choosing a โครงการ can
//     draw its map without a second round trip.
//   * `listBuildings` is the management page: the same rows plus how many
//     Properties each one holds, counted in Postgres (CLAUDE.md) rather than by
//     downloading Properties and grouping them here.
//
// Both are org-scoped through `requireMember`'s Org id, with RLS behind that.

import { createClient } from './supabase-server'
import { decodeCursor, encodeCursor } from './cursor'
import { keysetFilter } from './properties'

/** Enough Buildings for any agency this product is for, and a bound rather than
 *  no bound. `capped` is what the form says out loud when it is reached, so a
 *  missing โครงการ reads as "there are more than this" instead of "it is gone". */
export const OPTIONS_LIMIT = 500
export const BUILDINGS_PAGE_SIZE = 25

export interface BuildingOption {
  id: string
  name: string
  district: string
  googleMapUrl: string | null
}

export async function listBuildingOptions(
  orgId: string,
): Promise<{ options: BuildingOption[]; capped: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('buildings')
    .select('id, name, district, google_map_url')
    .eq('org_id', orgId)
    .order('name', { ascending: true })
    .limit(OPTIONS_LIMIT)
  if (error) throw error

  const rows = (data ?? []) as {
    id: string
    name: string
    district: string
    google_map_url: string | null
  }[]

  return {
    options: rows.map((b) => ({
      id: b.id,
      name: b.name,
      district: b.district,
      googleMapUrl: b.google_map_url,
    })),
    capped: rows.length === OPTIONS_LIMIT,
  }
}

export interface BuildingRow extends BuildingOption {
  nameEn: string | null
  province: string
  /** How many Properties name this Building. What a delete would strand. */
  propertyCount: number
}

export interface BuildingPage {
  rows: BuildingRow[]
  nextCursor: string | null
}

/**
 * One page of an Org's Buildings, newest first, optionally filtered by name.
 *
 * Same keyset shape as the Property list — a limit and a cursor, never an
 * OFFSET. The Property count rides along as a PostgREST embedded aggregate, so
 * it is one query with a GROUP BY in the database rather than a count per row.
 */
export async function listBuildings(
  orgId: string,
  opts: { search?: string | null; cursor?: string | null; limit?: number } = {},
): Promise<BuildingPage> {
  const limit = opts.limit ?? BUILDINGS_PAGE_SIZE
  const after = decodeCursor(opts.cursor)
  const supabase = await createClient()

  let query = supabase
    .from('buildings')
    .select('id, name, name_en, district, province, google_map_url, created_at, properties(count)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)

  const search = (opts.search ?? '').trim()
  // PostgREST reads * as the wildcard in `ilike`; the % and _ a person types are
  // literal to it, but the commas and parens that would break out of the filter
  // grammar are not, so the term is stripped of them before it goes anywhere.
  if (search) query = query.ilike('name', `*${search.replace(/[,()*]/g, '')}*`)
  if (after) query = query.or(keysetFilter(after))

  const { data, error } = await query
  if (error) throw error

  const records = (data ?? []) as {
    id: string
    name: string
    name_en: string | null
    district: string
    province: string
    google_map_url: string | null
    created_at: string
    properties: { count: number }[] | null
  }[]

  const page = records.slice(0, limit)
  const last = page.at(-1)
  const nextCursor =
    records.length > limit && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null

  return {
    rows: page.map((b) => ({
      id: b.id,
      name: b.name,
      nameEn: b.name_en,
      district: b.district,
      province: b.province,
      googleMapUrl: b.google_map_url,
      propertyCount: b.properties?.[0]?.count ?? 0,
    })),
    nextCursor,
  }
}

/** The Building's own name, read as the caller — so it doubles as the check
 *  that this Building belongs to an Org they are a Member of. Returns null when
 *  it does not, which the action turns into a refusal. */
export async function buildingName(orgId: string, buildingId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('buildings')
    .select('name')
    .eq('id', buildingId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  return (data as { name: string } | null)?.name ?? null
}
