// Reading Properties for the list page.
//
// Bounded, always: a limit and a keyset cursor (CLAUDE.md). The summary above
// the table is an aggregate function (ADR 0005); this is the ordinary SELECT
// underneath it, with the columns named rather than '*' — a list row does not
// need a Property's description, facilities or image array, and shipping them
// costs the same on every page for the life of the product.
//
// Two round-trips, not one: the second reads the active Rental behind each
// Property on the page, and it genuinely depends on the first (it filters by
// the ids the first returned). What it is not is a query per row.

import { createClient } from './supabase-server'
import { decodeCursor, encodeCursor, type PageKey } from './cursor'
// Type-only, so nothing server-side follows it back the other way: the runtime
// list of Property types lives in property-input.ts, which a client form can
// import without dragging next/headers into the browser bundle.
import type { PropertyType } from './property-input'
// Also type-only, and the other way round: buildings.ts and owners.ts import
// keysetFilter from here at runtime, so a value import back would close the
// cycle.
import type { BuildingOption } from './buildings'
import type { OwnerOption } from './owners'

export const PAGE_SIZE = 25

export const PROPERTY_STATUSES = ['available', 'reserved', 'rented'] as const
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number]

export function isPropertyStatus(value: unknown): value is PropertyStatus {
  return typeof value === 'string' && (PROPERTY_STATUSES as readonly string[]).includes(value)
}

export interface PropertyListRow {
  id: string
  title: string
  roomNumber: string | null
  propertyType: PropertyType
  bedrooms: number
  bathrooms: number
  areaSqm: number
  priceMonthly: number
  status: PropertyStatus
  /** Whose room this is. Name only — the phone that disambiguates two Owners
   *  belongs to the picker and the Owners page, not to a column being scanned.
   *  null when no Owner is on file, which is an ordinary state. */
  ownerName: string | null
  /** From the active Rental, when there is one. The snapshot column, so a
   *  Tenant record removed later does not blank out the list. */
  tenantName: string | null
  rentalEndDate: string | null
  /** Names of the Platforms this room is advertised on. Empty means nobody is
   *  marketing it — the state the list is scanned for (ADR 0003). */
  postedOn: string[]
}

export interface PropertyPage {
  rows: PropertyListRow[]
  /** Opaque cursor for the next page, or null when this was the last one. */
  nextCursor: string | null
}

interface PropertyRecord {
  id: string
  title: string
  room_number: string | null
  property_type: PropertyType
  bedrooms: number
  bathrooms: number
  area_sqm: number
  price_monthly: number
  status: PropertyStatus
  created_at: string
  // Embedded to-one: an object in the response, typed as either because
  // PostgREST's inference decides which. `embeddedOwner` normalises it.
  owners: EmbeddedOwnerName | EmbeddedOwnerName[] | null
  // Embedded to-many: one entry per channel this room is up on, absent
  // entirely when it is up nowhere.
  postings: EmbeddedPosting[] | null
}

interface EmbeddedOwnerName {
  name: string
}

interface EmbeddedPosting {
  platforms: { name: string } | { name: string }[] | null
}

/** PostgREST renders an embedded to-one as an object but may type it as an
 *  array; every embed here is read through this so that detail stays out of the
 *  pages. */
function embeddedOne<T>(embed: T | T[] | null | undefined): T | null {
  return Array.isArray(embed) ? (embed[0] ?? null) : (embed ?? null)
}

/**
 * One page of an Org's Properties, newest first.
 *
 * `orgId` comes from `requireMember` — never from a request body (ADR 0002) —
 * and the `org_id` filter here is belt and braces beside RLS: it is also what
 * lets the planner use properties_org_created_idx instead of filtering after
 * the fact.
 */
export async function listProperties(
  orgId: string,
  opts: {
    status?: PropertyStatus | null
    cursor?: string | null
    limit?: number
    /** Only rooms with no Posting at all. */
    postedNowhere?: boolean
  } = {},
): Promise<PropertyPage> {
  const limit = opts.limit ?? PAGE_SIZE
  const after = decodeCursor(opts.cursor)
  const supabase = await createClient()

  let query = supabase
    .from('properties')
    .select(
      'id, title, room_number, property_type, bedrooms, bathrooms, area_sqm, price_monthly, status, created_at, ' +
        // One join in the same round-trip rather than a second query keyed by
        // owner_id — the Owner column is on every row of the list.
        'owners(name), ' +
        // Second embed in the same round-trip. A to-many this time, so it comes
        // back as an array and is empty for a room posted nowhere.
        'postings(platforms(name))',
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    // One more than asked for: if it comes back, there is another page. Cheaper
    // than a second count query, and it cannot disagree with the rows shown.
    .limit(limit + 1)

  if (opts.status) query = query.eq('status', opts.status)
  // PostgREST filters a parent by the absence of an embedded resource with
  // `is.null` on the relationship name. It is the NOT EXISTS the tile counts
  // with, expressed the only way PostgREST expresses it — tests/rls covers it
  // precisely because it reads like it should not work.
  if (opts.postedNowhere) query = query.is('postings', null)
  if (after) query = query.or(keysetFilter(after))

  const { data, error } = await query
  if (error) throw error

  // Through unknown, like the edit read below: with an embed in the select and
  // no generated database types, supabase-js infers GenericStringError rather
  // than the row.
  const records = (data ?? []) as unknown as PropertyRecord[]
  const page = records.slice(0, limit)
  const last = page.at(-1)
  const nextCursor =
    records.length > limit && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null

  const rentals = await activeRentalsFor(page.map((p) => p.id))

  return {
    rows: page.map((p) => ({
      id: p.id,
      title: p.title,
      roomNumber: p.room_number,
      propertyType: p.property_type,
      bedrooms: p.bedrooms,
      bathrooms: p.bathrooms,
      areaSqm: Number(p.area_sqm),
      priceMonthly: Number(p.price_monthly),
      status: p.status,
      ownerName: embeddedOne(p.owners)?.name ?? null,
      tenantName: rentals.get(p.id)?.tenantName ?? null,
      rentalEndDate: rentals.get(p.id)?.endDate ?? null,
      postedOn: (p.postings ?? [])
        .map((post) => embeddedOne(post.platforms)?.name)
        .filter((name): name is string => Boolean(name))
        .sort((a, b) => a.localeCompare(b)),
    })),
    nextCursor,
  }
}

/** The half of the keyset that PostgREST has to be told in its own dialect:
 *  everything strictly after the last row in the sort order (newest first,
 *  id breaking ties). Exported so a test can read what gets sent. */
export function keysetFilter(after: PageKey): string {
  // The timestamp goes back exactly as Postgres wrote it. Passing it through a
  // JavaScript Date first — to "normalise" it — silently truncates microseconds
  // to milliseconds, and then `created_at.eq` matches nothing and
  // `created_at.lt` excludes the very rows that share the cursor's timestamp.
  // Every row of a batch import shares it, so the second page comes back empty
  // and the list looks like it ends after twenty-five rows. Postgres compares
  // timestamptz by instant, so whatever offset it is written with is already
  // correct; there is nothing to normalise.
  const at = after.createdAt
  return `created_at.lt.${at},and(created_at.eq.${at},id.lt.${after.id})`
}

/** The active Rental behind each Property on the page, if any. One query for
 *  the whole page — the shape Cozy Keys got wrong by asking per row. */
async function activeRentalsFor(
  propertyIds: string[],
): Promise<Map<string, { tenantName: string; endDate: string }>> {
  const found = new Map<string, { tenantName: string; endDate: string }>()
  if (propertyIds.length === 0) return found

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rentals')
    .select('property_id, tenant_name_snapshot, end_date')
    .in('property_id', propertyIds)
    .eq('status', 'active')
  if (error) throw error

  for (const r of (data ?? []) as {
    property_id: string
    tenant_name_snapshot: string
    end_date: string
  }[]) {
    found.set(r.property_id, { tenantName: r.tenant_name_snapshot, endDate: r.end_date })
  }
  return found
}

/** One Property as the edit form needs it: every column the form can change,
 *  plus its Building in the shape the combobox already takes so the page can
 *  hand it straight over. */
export interface PropertyEditRow {
  id: string
  title: string
  roomNumber: string | null
  propertyType: PropertyType
  bedrooms: number
  bathrooms: number
  areaSqm: number
  priceMonthly: number
  floor: number | null
  description: string | null
  contactLine: string | null
  status: PropertyStatus
  /** Storage keys, not URLs — the bucket is private. `signedPropertyImageUrls`
   *  turns them into something renderable. */
  images: string[]
  /** null for an ETL-imported row, which has no Building yet (CONTEXT.md). */
  building: BuildingOption | null
  /** In the shape the picker takes, so the edit page can hand it straight over
   *  and show the Owner already chosen — name and phone, as the option list
   *  renders them. null is the ordinary "nobody on file", not an import
   *  artefact. */
  owner: OwnerOption | null
}

/**
 * The Property behind the edit page, or null.
 *
 * A row belonging to another Org and a row that does not exist collapse to the
 * same answer on purpose: the page turns either into `notFound()`, so a probe
 * for a real id in an Org the caller cannot reach learns nothing from the
 * difference. RLS refuses it anyway; the `org_id` filter makes that a zero-row
 * read rather than a policy denial.
 *
 * `status` and `images` are read here rather than accepted from the form:
 * `updateProperty` decides the status lock and which photos really belong to
 * this row against these values, not against hidden fields a client sent.
 */
export async function getPropertyForEdit(
  orgId: string,
  id: string,
): Promise<PropertyEditRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('properties')
    .select(
      'id, title, room_number, property_type, bedrooms, bathrooms, area_sqm, price_monthly, ' +
        'floor, description, contact_line, status, images, owner_id, ' +
        'buildings(id, name, district, google_map_url), owners(id, name, phone)',
    )
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const row = data as unknown as PropertyEditRecord
  // PostgREST renders an embedded to-one as an object, but types it as either
  // depending on how it inferred the relationship; normalising here keeps that
  // detail out of the page.
  const b = embeddedOne(row.buildings)
  const o = embeddedOne(row.owners)

  return {
    id: row.id,
    title: row.title,
    roomNumber: row.room_number,
    propertyType: row.property_type,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    areaSqm: Number(row.area_sqm),
    priceMonthly: Number(row.price_monthly),
    floor: row.floor,
    description: row.description,
    contactLine: row.contact_line,
    status: row.status,
    images: row.images ?? [],
    building: b
      ? { id: b.id, name: b.name, district: b.district, googleMapUrl: b.google_map_url }
      : null,
    owner: o ? { id: o.id, name: o.name, phone: o.phone } : null,
  }
}

interface PropertyEditRecord {
  id: string
  title: string
  room_number: string | null
  property_type: PropertyType
  bedrooms: number
  bathrooms: number
  area_sqm: number
  price_monthly: number
  floor: number | null
  description: string | null
  contact_line: string | null
  status: PropertyStatus
  images: string[] | null
  owner_id: string | null
  buildings:
    | { id: string; name: string; district: string; google_map_url: string | null }
    | { id: string; name: string; district: string; google_map_url: string | null }[]
    | null
  owners: EmbeddedOwner | EmbeddedOwner[] | null
}

interface EmbeddedOwner {
  id: string
  name: string
  phone: string
}

export interface PropertyCounts {
  total: number
  available: number
  reserved: number
  rented: number
  /** Available rooms with no Posting at all — nobody is marketing them. */
  postedNowhere: number
}

/** The counts above the table. One row from Postgres (ADR 0005), not a reduce
 *  over rows the page just downloaded — the page only holds `limit` of them. */
export async function getPropertyCounts(orgId: string): Promise<PropertyCounts> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('org_property_counts', { p_org: orgId }).single()
  if (error) throw error
  const row = data as Record<string, number | string>
  return {
    total: Number(row.total),
    available: Number(row.available),
    reserved: Number(row.reserved),
    rented: Number(row.rented),
    postedNowhere: Number(row.posted_nowhere),
  }
}
