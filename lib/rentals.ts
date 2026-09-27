// Rentals: the pure lifecycle helper at the top, the reads underneath.
//
// Writes are not here. Every Rental transition is one invoker function (0017,
// ADR 0014) called from app/o/[slug]/rentals/actions.ts.
//
// Reads are org-scoped through `requireMember`'s Org id with RLS behind it,
// bounded, and name their columns. Nothing here selects from `tenants`: a
// Rental carries its Tenant's name and phone as snapshots, which is all a list
// or a detail page shows.
//
// This module reaches next/headers through the server client, so a client
// component must not import it — `getRentalStatus` is for Server Components.

import { createClient } from './supabase-server'
import { decodeCursor, encodeCursor } from './cursor'
import { addMonthsIso, daysBetween, todayBangkok } from './dates'
import { keysetFilter } from './properties'
import type { PaymentDirection, PaymentMethod, PaymentType, RentalStatus } from '@/types'

export const EXPIRING_SOON_DAYS = 30

export type RentalState = 'expired' | 'expiring' | 'active' | null

/**
 * How much runway a Rental has left, and which bucket that puts it in.
 *
 * Anchored to Asia/Bangkok rather than the host clock, so a job running on a
 * UTC server and an agent looking at their laptop in Bangkok agree on what
 * "today" means. Cozy Keys used the host clock here and Asia/Bangkok elsewhere,
 * which is the kind of split that produces a rental that looks expired on one
 * screen and active on another.
 */
export function getRentalStatus(
  endDate?: string | null,
  today: string = todayBangkok(),
): { daysLeft: number | null; state: RentalState } {
  if (!endDate) return { daysLeft: null, state: null }
  const daysLeft = daysBetween(today, endDate)
  if (daysLeft < 0) return { daysLeft, state: 'expired' }
  if (daysLeft <= EXPIRING_SOON_DAYS) return { daysLeft, state: 'expiring' }
  return { daysLeft, state: 'active' }
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export const RENTALS_PAGE_SIZE = 25

/** The chips above the list, each a filter. The same buckets as
 *  `org_rental_counts`, so a chip's number and the rows under it agree. */
export const RENTAL_FILTERS = [
  'active',
  'let_elsewhere',
  'ending_this_month',
  'past_end_date',
  'ended',
] as const
export type RentalFilter = (typeof RENTAL_FILTERS)[number]

export function isRentalFilter(value: unknown): value is RentalFilter {
  return typeof value === 'string' && (RENTAL_FILTERS as readonly string[]).includes(value)
}

export interface RentalListRow {
  id: string
  propertyId: string
  propertyTitle: string
  roomNumber: string | null
  /** The snapshot, so a Tenant record removed later does not blank the row. */
  tenantName: string
  startDate: string
  endDate: string
  monthlyRent: number
  rentedByUs: boolean
  rentTrackedByUs: boolean
  /** NOT rented_by_us AND NOT rent_tracked_by_us (ADR 0011, amended). */
  letElsewhere: boolean
  status: RentalStatus
}

export interface RentalPage {
  rows: RentalListRow[]
  nextCursor: string | null
}

interface RentalListRecord {
  id: string
  property_id: string
  tenant_name_snapshot: string
  start_date: string
  end_date: string
  monthly_rent: number
  rented_by_us: boolean
  rent_tracked_by_us: boolean
  status: RentalStatus
  created_at: string
  properties: EmbeddedProperty | EmbeddedProperty[] | null
}

interface EmbeddedProperty {
  title: string
  room_number: string | null
}

function embeddedOne<T>(embed: T | T[] | null | undefined): T | null {
  return Array.isArray(embed) ? (embed[0] ?? null) : (embed ?? null)
}

/** First day of `today`'s month and of the next — org_dashboard's calendar
 *  month, not a rolling thirty days. */
function monthBounds(today: string): { from: string; to: string } {
  const from = `${today.slice(0, 7)}-01`
  return { from, to: addMonthsIso(from, 1) }
}

/**
 * One page of an Org's Rentals, newest first, keyset on (created_at, id) —
 * rentals_org_created_idx (0017). No filter means every Rental, ended included.
 */
export async function listRentals(
  orgId: string,
  opts: {
    filter?: RentalFilter | null
    cursor?: string | null
    limit?: number
    today?: string
  } = {},
): Promise<RentalPage> {
  const limit = opts.limit ?? RENTALS_PAGE_SIZE
  const after = decodeCursor(opts.cursor)
  const today = opts.today ?? todayBangkok()
  const supabase = await createClient()

  let query = supabase
    .from('rentals')
    .select(
      'id, property_id, tenant_name_snapshot, start_date, end_date, monthly_rent, ' +
        'rented_by_us, rent_tracked_by_us, status, created_at, properties(title, room_number)',
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)

  switch (opts.filter) {
    case 'active':
      query = query.eq('status', 'active').or('rented_by_us.is.true,rent_tracked_by_us.is.true')
      break
    case 'let_elsewhere':
      query = query.eq('status', 'active').is('rented_by_us', false).is('rent_tracked_by_us', false)
      break
    case 'ending_this_month': {
      const { from, to } = monthBounds(today)
      query = query.eq('status', 'active').gte('end_date', from).lt('end_date', to)
      break
    }
    case 'past_end_date':
      query = query.eq('status', 'active').lt('end_date', today)
      break
    case 'ended':
      query = query.eq('status', 'ended')
      break
  }
  // A second `or` is ANDed with the filter's, not a replacement for it:
  // postgrest-js appends each one as its own query parameter.
  if (after) query = query.or(keysetFilter(after))

  const { data, error } = await query
  if (error) throw error

  const records = (data ?? []) as unknown as RentalListRecord[]
  const page = records.slice(0, limit)
  const last = page.at(-1)
  const nextCursor =
    records.length > limit && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null

  return {
    rows: page.map((r) => {
      const p = embeddedOne(r.properties)
      return {
        id: r.id,
        propertyId: r.property_id,
        propertyTitle: p?.title ?? '',
        roomNumber: p?.room_number ?? null,
        tenantName: r.tenant_name_snapshot,
        startDate: r.start_date,
        endDate: r.end_date,
        monthlyRent: Number(r.monthly_rent),
        rentedByUs: r.rented_by_us,
        rentTrackedByUs: r.rent_tracked_by_us,
        letElsewhere: !r.rented_by_us && !r.rent_tracked_by_us,
        status: r.status,
      }
    }),
    nextCursor,
  }
}

export interface RentalDetail extends RentalListRow {
  tenantId: string | null
  tenantPhone: string | null
  deposit: number
  commission: number
  /** timestamptz — the Bangkok midnight of the day it ended (0017). */
  endedAt: string | null
  endedReason: string | null
  note: string | null
  createdAt: string
  /** Rental Documents attached. A Rental with any cannot be deleted. */
  documentCount: number
}

interface RentalDetailRecord extends RentalListRecord {
  tenant_id: string | null
  tenant_phone_snapshot: string | null
  deposit: number
  commission: number
  ended_at: string | null
  ended_reason: string | null
  note: string | null
  rental_documents: { count: number }[] | null
}

/**
 * One Rental, or null. Another Org's Rental and one that does not exist are the
 * same null, so a probe learns nothing. Independent of `listPaymentsForRental`
 * — both are keyed by the route's id — so a page runs them in one Promise.all.
 */
export async function getRental(orgId: string, id: string): Promise<RentalDetail | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rentals')
    .select(
      'id, property_id, tenant_id, tenant_name_snapshot, tenant_phone_snapshot, start_date, end_date, ' +
        'monthly_rent, deposit, commission, rented_by_us, rent_tracked_by_us, status, ended_at, ' +
        'ended_reason, note, created_at, properties(title, room_number), rental_documents(count)',
    )
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const r = data as unknown as RentalDetailRecord
  const p = embeddedOne(r.properties)
  return {
    id: r.id,
    propertyId: r.property_id,
    propertyTitle: p?.title ?? '',
    roomNumber: p?.room_number ?? null,
    tenantId: r.tenant_id,
    tenantName: r.tenant_name_snapshot,
    tenantPhone: r.tenant_phone_snapshot,
    startDate: r.start_date,
    endDate: r.end_date,
    monthlyRent: Number(r.monthly_rent),
    deposit: Number(r.deposit),
    commission: Number(r.commission),
    rentedByUs: r.rented_by_us,
    rentTrackedByUs: r.rent_tracked_by_us,
    letElsewhere: !r.rented_by_us && !r.rent_tracked_by_us,
    status: r.status,
    endedAt: r.ended_at,
    endedReason: r.ended_reason,
    note: r.note,
    createdAt: r.created_at,
    documentCount: r.rental_documents?.[0]?.count ?? 0,
  }
}

/** Ten years of monthly rent plus the one-offs. A Rental past it is a data
 *  entry error, and `capped` makes the page say so rather than look complete. */
export const RENTAL_PAYMENTS_LIMIT = 120

/** In the shape getPaymentStatus, outstanding and futureUnpaid take. */
export interface RentalPayment {
  id: string
  direction: PaymentDirection
  type: PaymentType
  due_date: string
  amount: number
  settled_date: string | null
  settled_amount: number | null
  method: PaymentMethod | null
  note: string | null
}

export async function listPaymentsForRental(
  orgId: string,
  rentalId: string,
): Promise<{ payments: RentalPayment[]; capped: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('payments')
    .select('id, direction, type, due_date, amount, settled_date, settled_amount, method, note')
    .eq('org_id', orgId)
    .eq('rental_id', rentalId)
    .order('due_date', { ascending: true })
    .order('id', { ascending: true })
    .limit(RENTAL_PAYMENTS_LIMIT + 1)
  if (error) throw error

  const rows = (data ?? []) as RentalPayment[]
  return {
    payments: rows.slice(0, RENTAL_PAYMENTS_LIMIT).map((p) => ({
      ...p,
      amount: Number(p.amount),
      settled_amount: p.settled_amount === null ? null : Number(p.settled_amount),
    })),
    capped: rows.length > RENTAL_PAYMENTS_LIMIT,
  }
}

export interface RentalCounts {
  /** Excludes let-elsewhere: the agency's own tenancies. */
  active: number
  letElsewhere: number
  /** Every active Rental ending in today's calendar month, let-elsewhere too. */
  endingThisMonth: number
  /** Active, end date gone by — no expiry job yet (ADR 0012). */
  pastEndDate: number
  ended: number
}

/** One row from Postgres (ADR 0005), not a count per chip. */
export async function getRentalCounts(
  orgId: string,
  today: string = todayBangkok(),
): Promise<RentalCounts> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('org_rental_counts', { p_org: orgId, p_today: today })
    .single()
  if (error) throw error
  const row = data as Record<string, number | string>
  return {
    active: Number(row.active),
    letElsewhere: Number(row.let_elsewhere),
    endingThisMonth: Number(row.ending_this_month),
    pastEndDate: Number(row.past_end_date),
    ended: Number(row.ended),
  }
}

export const RENTABLE_LIMIT = 500

export interface RentableProperty {
  id: string
  title: string
  /** The new-Rental form's default rent (decision 11). */
  priceMonthly: number
  /** `rented` here is the stale kind — no active Rental behind it — and the
   *  form lets it be recorded properly. */
  status: 'available' | 'reserved' | 'rented'
  /** Tells apart rooms whose titles match — ETL rows often have no room number. */
  ownerName: string | null
}

/**
 * Properties with no active Rental, for the new-Rental combobox. One query: the
 * embed is filtered to active Rentals and `is.null` keeps only the parents
 * where that leaves nothing — the anti-join listProperties uses for Postings.
 */
export async function listRentableProperties(
  orgId: string,
): Promise<{ options: RentableProperty[]; capped: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('properties')
    .select('id, title, price_monthly, status, owners(name), rentals(id)')
    .eq('org_id', orgId)
    .eq('rentals.status', 'active')
    .is('rentals', null)
    .order('title', { ascending: true })
    .limit(RENTABLE_LIMIT)
  if (error) throw error

  const rows = (data ?? []) as unknown as {
    id: string
    title: string
    price_monthly: number
    status: RentableProperty['status']
    owners: { name: string } | { name: string }[] | null
  }[]
  return {
    options: rows.map((p) => ({
      id: p.id,
      title: p.title,
      priceMonthly: Number(p.price_monthly),
      status: p.status,
      ownerName: (Array.isArray(p.owners) ? p.owners[0] : p.owners)?.name ?? null,
    })),
    capped: rows.length === RENTABLE_LIMIT,
  }
}

/** The Org's default for `rent_tracked_by_us` on a new Rental (ADR 0011).
 *  Read here rather than carried on `Org`, because only this form needs it. */
export async function getOrgTracksRent(orgId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('orgs')
    .select('tracks_rent')
    .eq('id', orgId)
    .maybeSingle()
  if (error) throw error
  return (data as { tracks_rent: boolean } | null)?.tracks_rent ?? false
}
