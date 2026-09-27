// The Org landing page's numbers.
//
// One call, one round-trip: the aggregation happens in Postgres
// (supabase/migrations/0003_org_dashboard.sql), not here. Nothing in this file
// counts rows — if a tile ever needs a number this function does not return,
// the change belongs in the SQL, not in a second query beside it.

import { createClient } from './supabase-server'
import { todayBangkok } from './dates'

export interface OrgDashboard {
  propertiesTotal: number
  /** Excludes Rentals let by another agent (0017) — not the agency's workload. */
  rentalsActive: number
  rentalsEndingThisMonth: number
  /** Money owed in and past due, in baht: what is still outstanding, so a
   *  partly settled Payment counts by its remainder (0018). Excludes what is
   *  owed back out — a Deposit Refund is a separate obligation, not a negative
   *  one, and is `refundsLate`. */
  overdueAmount: number
  overdueCount: number
  /** Deposit Refunds past due and outstanding. A count, never added to the
   *  overdue figure. */
  refundsLate: number
}

/**
 * Read the dashboard aggregate for an Org the caller has already been admitted
 * to. `orgId` comes from `requireMember`, never from a request body (ADR 0002),
 * and the function is SECURITY INVOKER besides — RLS returns zeros for an Org
 * the caller is not a member of, so a mistake here leaks nothing.
 *
 * `today` is Asia/Bangkok, because the whole product's idea of a day is
 * (CLAUDE.md). Passing it explicitly keeps the definition in lib/dates.ts.
 */
export async function getOrgDashboard(
  orgId: string,
  today: string = todayBangkok(),
): Promise<OrgDashboard> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('org_dashboard', { p_org: orgId, p_today: today })
    .single()
  if (error) throw error

  const row = data as Record<string, number | string>
  return {
    propertiesTotal: Number(row.properties_total),
    rentalsActive: Number(row.rentals_active),
    rentalsEndingThisMonth: Number(row.rentals_ending_this_month),
    // numeric arrives as a JSON number from PostgREST, but a string from some
    // drivers; coerce rather than trust the wire format.
    overdueAmount: Number(row.overdue_amount),
    overdueCount: Number(row.overdue_count),
    refundsLate: Number(row.refunds_late),
  }
}
