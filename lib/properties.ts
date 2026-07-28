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
  propertyType: 'condo' | 'house' | 'townhome'
  bedrooms: number
  bathrooms: number
  areaSqm: number
  priceMonthly: number
  status: PropertyStatus
  /** From the active Rental, when there is one. The snapshot column, so a
   *  Tenant record removed later does not blank out the list. */
  tenantName: string | null
  rentalEndDate: string | null
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
  property_type: 'condo' | 'house' | 'townhome'
  bedrooms: number
  bathrooms: number
  area_sqm: number
  price_monthly: number
  status: PropertyStatus
  created_at: string
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
  opts: { status?: PropertyStatus | null; cursor?: string | null; limit?: number } = {},
): Promise<PropertyPage> {
  const limit = opts.limit ?? PAGE_SIZE
  const after = decodeCursor(opts.cursor)
  const supabase = await createClient()

  let query = supabase
    .from('properties')
    .select(
      'id, title, room_number, property_type, bedrooms, bathrooms, area_sqm, price_monthly, status, created_at',
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    // One more than asked for: if it comes back, there is another page. Cheaper
    // than a second count query, and it cannot disagree with the rows shown.
    .limit(limit + 1)

  if (opts.status) query = query.eq('status', opts.status)
  if (after) query = query.or(keysetFilter(after))

  const { data, error } = await query
  if (error) throw error

  const records = (data ?? []) as PropertyRecord[]
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
      tenantName: rentals.get(p.id)?.tenantName ?? null,
      rentalEndDate: rentals.get(p.id)?.endDate ?? null,
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

export interface PropertyCounts {
  total: number
  available: number
  reserved: number
  rented: number
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
  }
}
