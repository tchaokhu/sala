// Payments across an Org: the list, one row, and the chips above the list.
//
// Writes are app/o/[slug]/payments/actions.ts. Reads are org-scoped through
// `requireMember`'s Org id with RLS behind it, bounded, and name their columns.
// Like lib/rentals.ts this reaches next/headers through the server client, so
// a client component must not import it — the pure half is lib/payments.ts.

import { createClient } from './supabase-server'
import { decodeCursor, encodeCursor, type PageKey } from './cursor'
import { addDaysIso, todayBangkok } from './dates'
import type { RentalPayment } from './rentals'

export const PAYMENTS_PAGE_SIZE = 25

/** Due soon is today through this many days ahead — org_payment_counts' rule. */
export const DUE_SOON_DAYS = 7

/** The filters, `overdue` first because the page opens on it (decision 5). */
export const PAYMENT_FILTERS = ['overdue', 'due_soon', 'refunds', 'settled', 'all'] as const
export type PaymentFilter = (typeof PAYMENT_FILTERS)[number]

export function isPaymentFilter(value: unknown): value is PaymentFilter {
  return typeof value === 'string' && (PAYMENT_FILTERS as readonly string[]).includes(value)
}

/** The Rental page's Payment row plus where it sits, so one Settle / Correct
 *  component takes either. Who pays is `payerOf(type)`; status is
 *  `getPaymentStatus` — both derived, neither carried. */
export interface PaymentListRow extends RentalPayment {
  rental_id: string
  property_id: string
  property_title: string
  /** The Rental's snapshot; the Tenant is who pays when payerOf says so. */
  tenant_name: string
  /** amount less what is settled so far — the generated column (0018). */
  outstanding: number
}

export interface PaymentPage {
  rows: PaymentListRow[]
  nextCursor: string | null
}

const COLUMNS =
  'id, rental_id, property_id, direction, type, due_date, amount, settled_date, settled_amount, ' +
  'method, note, outstanding, properties(title), rentals(tenant_name_snapshot)'

type One<T> = T | T[] | null

interface PaymentRecord extends Omit<PaymentListRow, 'property_title' | 'tenant_name'> {
  properties: One<{ title: string }>
  rentals: One<{ tenant_name_snapshot: string }>
}

function one<T>(embed: One<T> | undefined): T | null {
  return Array.isArray(embed) ? (embed[0] ?? null) : (embed ?? null)
}

function toRow(r: PaymentRecord): PaymentListRow {
  return {
    id: r.id,
    rental_id: r.rental_id,
    property_id: r.property_id,
    property_title: one(r.properties)?.title ?? '',
    tenant_name: one(r.rentals)?.tenant_name_snapshot ?? '',
    direction: r.direction,
    type: r.type,
    due_date: r.due_date,
    amount: Number(r.amount),
    settled_date: r.settled_date,
    settled_amount: r.settled_amount === null ? null : Number(r.settled_amount),
    method: r.method,
    note: r.note,
    outstanding: Number(r.outstanding),
  }
}

/** Overdue and Due soon are to-do lists, oldest first; the rest are records,
 *  newest first. */
const ASCENDING: Record<PaymentFilter, boolean> = {
  overdue: true,
  due_soon: true,
  refunds: false,
  settled: false,
  all: false,
}

/**
 * One page of an Org's Payments, keyset on (due_date, id). The cursor's
 * `createdAt` carries the due date — the sort key, whatever its column.
 */
export async function listPayments(
  orgId: string,
  opts: {
    filter?: PaymentFilter | null
    cursor?: string | null
    today?: string
    limit?: number
  } = {},
): Promise<PaymentPage> {
  const filter = opts.filter ?? 'overdue'
  const limit = opts.limit ?? PAYMENTS_PAGE_SIZE
  const today = opts.today ?? todayBangkok()
  const after = decodeCursor(opts.cursor)
  const ascending = ASCENDING[filter]
  const supabase = await createClient()

  let query = supabase
    .from('payments')
    .select(COLUMNS)
    .eq('org_id', orgId)
    .order('due_date', { ascending })
    .order('id', { ascending })
    .limit(limit + 1)

  switch (filter) {
    case 'overdue':
      query = query.gt('outstanding', 0).lt('due_date', today)
      break
    case 'due_soon':
      query = query.gt('outstanding', 0).gte('due_date', today).lte('due_date', addDaysIso(today, DUE_SOON_DAYS))
      break
    case 'refunds':
      query = query.eq('type', 'deposit_refund')
      break
    case 'settled':
      query = query.lte('outstanding', 0)
      break
  }
  if (after) {
    // The plain bound is what lets payments_org_due_idx seek to the page; the
    // OR alone is only a filter, applied to every row before the cursor (0018).
    query = ascending ? query.gte('due_date', after.createdAt) : query.lte('due_date', after.createdAt)
    query = query.or(keysetAfter(after, ascending))
  }

  const { data, error } = await query
  if (error) throw error

  const records = (data ?? []) as unknown as PaymentRecord[]
  const page = records.slice(0, limit)
  const last = page.at(-1)
  return {
    rows: page.map(toRow),
    nextCursor:
      records.length > limit && last ? encodeCursor({ createdAt: last.due_date, id: last.id }) : null,
  }
}

/** Strictly past the cursor in the list's order. */
function keysetAfter(after: PageKey, ascending: boolean): string {
  const op = ascending ? 'gt' : 'lt'
  return `due_date.${op}.${after.createdAt},and(due_date.eq.${after.createdAt},id.${op}.${after.id})`
}

/** One Payment, or null — another Org's and a missing one are the same null. */
export async function getPayment(orgId: string, id: string): Promise<PaymentListRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('payments')
    .select(COLUMNS)
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  return data ? toRow(data as unknown as PaymentRecord) : null
}

export interface PaymentCounts {
  /** Money owed in, past due, still outstanding. */
  overdueCount: number
  overdueAmount: number
  /** Deposit Refunds past due — owed out, never added to the above. */
  refundsLateCount: number
  refundsLateAmount: number
  /** Today through DUE_SOON_DAYS ahead, both directions. */
  dueSoonCount: number
  /** Settled in full, last settlement inside today's calendar month. */
  settledThisMonthCount: number
}

/** One row from Postgres (ADR 0005), not a count per chip. */
export async function getPaymentCounts(
  orgId: string,
  today: string = todayBangkok(),
): Promise<PaymentCounts> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('org_payment_counts', { p_org: orgId, p_today: today })
    .single()
  if (error) throw error
  const row = data as Record<string, number | string>
  return {
    overdueCount: Number(row.overdue_count),
    overdueAmount: Number(row.overdue_amount),
    refundsLateCount: Number(row.refunds_late_count),
    refundsLateAmount: Number(row.refunds_late_amount),
    dueSoonCount: Number(row.due_soon_count),
    settledThisMonthCount: Number(row.settled_this_month_count),
  }
}
