// Reading Buildings — the named development a Property sits in.
//
// Two readers with different jobs:
//   * `listBuildingOptions` fills the combobox on the Property form. Four small
//     columns, bounded, and the map link comes with it so choosing a Building can
//     draw its map without a second round trip.
//   * `listBuildings` is the management page: the same rows plus how many
//     Properties each one holds, counted in Postgres (CLAUDE.md) rather than by
//     downloading Properties and grouping them here.
//
// Both are org-scoped through `requireMember`'s Org id, with RLS behind that.
//
// `resolveBuilding` at the bottom is the one thing here that writes: the
// Property form's combobox may name a Building that does not exist yet, and both
// creating and editing a Property need that resolved the same way.

import { createClient } from './supabase-server'
import { decodeCursor, encodeCursor } from './cursor'
import { embeddedOne, keysetFilter, type PropertyStatus } from './properties'

/** Enough Buildings for any agency this product is for, and a bound rather than
 *  no bound. `capped` is what the form says out loud when it is reached, so a
 *  missing Building reads as "there are more than this" instead of "it is gone". */
export const OPTIONS_LIMIT = 500
export const BUILDINGS_PAGE_SIZE = 25

export interface BuildingOption {
  id: string
  name: string
  /** Shown first in the picker when there is one (the English standard). */
  nameEn: string | null
  district: string
  googleMapUrl: string | null
}

export async function listBuildingOptions(
  orgId: string,
): Promise<{ options: BuildingOption[]; capped: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('buildings')
    .select('id, name, name_en, district, google_map_url')
    .eq('org_id', orgId)
    .order('name', { ascending: true })
    .limit(OPTIONS_LIMIT)
  if (error) throw error

  const rows = (data ?? []) as {
    id: string
    name: string
    name_en: string | null
    district: string
    google_map_url: string | null
  }[]

  return {
    options: rows.map((b) => ({
      id: b.id,
      name: b.name,
      nameEn: b.name_en,
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
  if (search) query = query.ilike('name', `*${search}*`)
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

export interface BuildingDetail extends BuildingRow {
  subdistrict: string
  postcode: string
  facilities: string[]
  nearby: string[]
}

/** One Building in full, for its own page. Null when it is not this Org's. */
export async function getBuilding(orgId: string, buildingId: string): Promise<BuildingDetail | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('buildings')
    .select('id, name, name_en, district, province, subdistrict, postcode, google_map_url, facilities, nearby, properties(count)')
    .eq('id', buildingId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const b = data as {
    id: string
    name: string
    name_en: string | null
    district: string
    province: string
    subdistrict: string
    postcode: string
    google_map_url: string | null
    facilities: string[] | null
    nearby: string[] | null
    properties: { count: number }[] | null
  }
  return {
    id: b.id,
    name: b.name,
    nameEn: b.name_en,
    district: b.district,
    province: b.province,
    subdistrict: b.subdistrict,
    postcode: b.postcode,
    googleMapUrl: b.google_map_url,
    facilities: b.facilities ?? [],
    nearby: b.nearby ?? [],
    propertyCount: b.properties?.[0]?.count ?? 0,
  }
}

export const BUILDING_PROPERTIES_LIMIT = 100

export interface BuildingProperty {
  id: string
  title: string
  /** The title is the Building's name for every ETL row without a room
   *  number, so these are what tell one row from the next. */
  roomNumber: string | null
  floor: number | null
  ownerName: string | null
  status: PropertyStatus
  priceMonthly: number
}

/** The Properties in one Building, for its page. Bounded; `capped` says so. */
export function listBuildingProperties(orgId: string, buildingId: string) {
  return listPropertiesWhere(orgId, 'building_id', buildingId)
}

/** The Properties one Owner owns, for the Owner's page — the same read. */
export function listOwnerProperties(orgId: string, ownerId: string) {
  return listPropertiesWhere(orgId, 'owner_id', ownerId)
}

async function listPropertiesWhere(
  orgId: string,
  column: 'building_id' | 'owner_id',
  id: string,
): Promise<{ rows: BuildingProperty[]; capped: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('properties')
    .select('id, title, room_number, floor, status, price_monthly, owners(name)')
    .eq('org_id', orgId)
    .eq(column, id)
    .order('title', { ascending: true })
    .order('id', { ascending: true })
    .limit(BUILDING_PROPERTIES_LIMIT + 1)
  if (error) throw error

  const rows = (data ?? []) as {
    id: string
    title: string
    room_number: string | null
    floor: number | null
    status: PropertyStatus
    price_monthly: number
    owners: { name: string } | { name: string }[] | null
  }[]
  return {
    rows: rows.slice(0, BUILDING_PROPERTIES_LIMIT).map((p) => ({
      id: p.id,
      title: p.title,
      roomNumber: p.room_number,
      floor: p.floor,
      ownerName: embeddedOne(p.owners)?.name ?? null,
      status: p.status,
      priceMonthly: Number(p.price_monthly),
    })),
    capped: rows.length > BUILDING_PROPERTIES_LIMIT,
  }
}

export class UnknownBuildingError extends Error {}

/**
 * The Building this Property belongs to, creating it when the combobox carried
 * a name nobody has entered yet.
 *
 * The id path re-reads the name from the database instead of taking the text
 * beside it: the two fields are posted together and only one of them is checked
 * against the Org. A `building_id` from another agency finds no row — the read
 * runs as the caller, under RLS, filtered by the Org `requireMember` returned —
 * and becomes a refusal rather than a Property titled after someone else's
 * building.
 *
 * The created Building gets a name and nothing else. Its district and its map
 * link belong to the Buildings page rather than to a field on this form.
 *
 * Lives here rather than beside `createProperty` because editing a Property may
 * reassign its Building, and both paths have to refuse a foreign id the same way.
 */
export async function resolveBuilding(
  orgId: string,
  choice: { buildingId: string | null; newName: string | null },
): Promise<{ id: string; name: string }> {
  if (choice.buildingId) {
    const name = await buildingName(orgId, choice.buildingId)
    if (!name) throw new UnknownBuildingError()
    return { id: choice.buildingId, name }
  }

  const name = choice.newName as string
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('buildings')
    .insert({ org_id: orgId, name, district: '', province: '' })
    .select('id, name')
    .single()

  // The name was typed rather than picked, and the Org already has it
  // (buildings_org_name_key, 0020). That is the same development, so it is the
  // existing Building — this is how the duplicate Blisses were made.
  if (error?.code === UNIQUE_VIOLATION) {
    const existing = await buildingNamed(orgId, name)
    if (existing) return existing
  }
  if (error) throw error

  return data as { id: string; name: string }
}

const UNIQUE_VIOLATION = '23505'

/** The Org's Building whose name matches ignoring case and outer spaces — the
 *  index's own rule. PostgREST has no lower(), so `ilike` narrows and the exact
 *  comparison happens here. */
export async function buildingNamed(
  orgId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const key = name.trim().toLocaleLowerCase()
  // % and _ are wildcards to ilike; escaped, they match themselves.
  const pattern = `*${name.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}*`
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('buildings')
    .select('id, name')
    .eq('org_id', orgId)
    .ilike('name', pattern)
    .limit(20)
  if (error) throw error
  const rows = (data ?? []) as { id: string; name: string }[]
  return rows.find((b) => b.name.trim().toLocaleLowerCase() === key) ?? null
}
