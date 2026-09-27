// Everything the Rental forms decide, with no I/O in it — the same split as
// lib/property-input.ts, and importable from a client form for the same reason.
//
// There is no ID-card field anywhere here, by decision: the Tenant's identity
// document is kept as a file, and Sala does not need the number. Nothing in this
// module reads `id_card`, and no message below repeats anything a person typed
// about a Tenant — a refusal names the field, never its value.

import { addDaysIso, addMonthsIso, isIsoDate, todayBangkok } from './dates'
import { formatBaht } from './format'
import { blankToNull, fail, MAX_PRICE, number, type FormLike, type Parsed } from './property-input'
import { cleanText, isPhone } from './validate'

/** How the new-Rental form's switch posts: a Rental of ours, or a room let by
 *  another agent — recorded only so it comes back up as it frees. */
export const RENTAL_MODES = ['ours', 'elsewhere'] as const
export type RentalMode = (typeof RENTAL_MODES)[number]

/** The snapshot name a let-elsewhere Rental carries. Written by create_rental
 *  (0017), not by the form; here so the UI can say the same words. */
export const LET_ELSEWHERE_NAME = 'Let by another agent'

/** No column of its own (ADR 0011, amended): a Rental the agency neither let
 *  nor follows the rent of. If that ever stops being unambiguous, it becomes one. */
export function isLetElsewhere(r: { rented_by_us: boolean; rent_tracked_by_us: boolean }): boolean {
  return !r.rented_by_us && !r.rent_tracked_by_us
}

/** Decision 11's term: twelve months, ending the day before the anniversary. */
export function defaultEndDate(start: string): string {
  return addDaysIso(addMonthsIso(start, 12), -1)
}

/** A Deposit Refund is due this long after the Rental ends by default, so it is
 *  not overdue the morning after. */
export const REFUND_DUE_DAYS = 30

export const MAX_TENANT_NAME = 200
export const MAX_TENANT_PHONE = 40
export const MAX_LINE_ID = 100
export const MAX_TENANT_NOTE = 2000
export const MAX_END_REASON = 500

export interface NewTenantInput {
  name: string
  phone: string | null
  line_id: string | null
  note: string | null
}

/** What the new-Rental form produces, in create_rental's own terms. Exactly one
 *  of `tenant_id` and `new_tenant` is set for a Rental of ours; neither for one
 *  let elsewhere. Whether `property_id` and `tenant_id` are this Org's is a
 *  read, so the action decides it. */
export interface NewRentalInput {
  property_id: string
  tenant_id: string | null
  new_tenant: NewTenantInput | null
  start_date: string
  end_date: string
  monthly_rent: number
  deposit: number
  commission: number
  rented_by_us: boolean
  rent_tracked_by_us: boolean
  paid_through: string | null
}

/**
 * Read the new-Rental form.
 *
 * Both flags are checkboxes: present means ticked, absent means not. Their
 * defaults (ticked; the Org's `tracks_rent`) are the form's job, and the action
 * writes whatever arrives explicitly rather than leaning on a column default.
 */
export function parseRentalForm(form: FormLike): Parsed<NewRentalInput> {
  const property_id = cleanText(form.get('property_id'), 40)
  if (!property_id) return fail('Choose the Property being let')

  const rawMode = form.get('mode')
  const mode: RentalMode = rawMode === 'elsewhere' ? 'elsewhere' : 'ours'

  const start = date(form.get('start_date'), 'Start date')
  if (!start.ok) return start
  const end = date(form.get('end_date'), 'End date')
  if (!end.ok) return end
  if (end.values < start.values) return fail('The end date must be on or after the start date')

  // Let by another agent: no Tenant, no money, nothing followed. Forced rather
  // than refused, because the form hides these fields and whatever they held
  // before the switch was flipped is not an answer.
  if (mode === 'elsewhere') {
    return {
      ok: true,
      values: {
        property_id,
        tenant_id: null,
        new_tenant: null,
        start_date: start.values,
        end_date: end.values,
        monthly_rent: 0,
        deposit: 0,
        commission: 0,
        rented_by_us: false,
        rent_tracked_by_us: false,
        paid_through: null,
      },
    }
  }

  const tenant = parseTenantChoice(form)
  if (!tenant.ok) return tenant

  const rented_by_us = ticked(form.get('rented_by_us'))
  const rent_tracked_by_us = ticked(form.get('rent_tracked_by_us'))

  const rent = number(form.get('monthly_rent'), {
    label: 'Rent per month',
    min: 0,
    max: MAX_PRICE,
    required: true,
  })
  if (!rent.ok) return rent
  const monthly_rent = rent.values ?? 0
  // Followed rent becomes a Payment a month, and a Payment of 0 is refused by
  // the database with text nobody can act on.
  if (rent_tracked_by_us && monthly_rent <= 0) {
    return fail('Rent per month must be above 0 when the rent is followed')
  }

  const deposit = number(form.get('deposit'), { label: 'Deposit', min: 0, max: MAX_PRICE })
  if (!deposit.ok) return deposit
  const commission = number(form.get('commission'), { label: 'Commission', min: 0, max: MAX_PRICE })
  if (!commission.ok) return commission

  // Refused rather than dropped: buildPaymentSchedule would silently bill
  // nothing, and the person would believe a Commission was recorded.
  if ((commission.values ?? 0) > 0 && !rented_by_us) {
    return fail('Commission is only charged on a Rental we let. Set it to 0, or mark this Rental as let by us.')
  }

  let paid_through: string | null = null
  const rawPaid = cleanText(form.get('paid_through'), 20)
  if (rawPaid) {
    if (!isIsoDate(rawPaid)) return fail('Paid through must be a date')
    if (rawPaid < start.values || rawPaid > end.values) {
      return fail('Paid through must fall between the start and end dates')
    }
    paid_through = rawPaid
  }

  return {
    ok: true,
    values: {
      property_id,
      tenant_id: tenant.values.tenant_id,
      new_tenant: tenant.values.new_tenant,
      start_date: start.values,
      end_date: end.values,
      monthly_rent,
      deposit: deposit.values ?? 0,
      commission: commission.values ?? 0,
      rented_by_us,
      rent_tracked_by_us,
      paid_through,
    },
  }
}

/** Picked or created, the `resolveBuilding` shape: an id wins, because it is
 *  what the person actually chose off the list. */
function parseTenantChoice(
  form: FormLike,
): Parsed<{ tenant_id: string | null; new_tenant: NewTenantInput | null }> {
  const tenant_id = cleanText(form.get('tenant_id'), 40)
  if (tenant_id) return { ok: true, values: { tenant_id, new_tenant: null } }

  const name = cleanText(form.get('tenant_name'), MAX_TENANT_NAME)
  if (!name) return fail('Choose a Tenant, or enter the name of a new one')

  const phone = blankToNull(form.get('tenant_phone'), MAX_TENANT_PHONE)
  if (phone && !isPhone(phone)) {
    return fail("The Tenant's phone must be digits, 6 to 15 of them, optionally starting with + — for example 081 234 5678")
  }

  return {
    ok: true,
    values: {
      tenant_id: null,
      new_tenant: {
        name,
        phone,
        line_id: blankToNull(form.get('tenant_line_id'), MAX_LINE_ID),
        note: blankToNull(form.get('tenant_note'), MAX_TENANT_NOTE),
      },
    },
  }
}

export interface EndRentalInput {
  ended_on: string
  reason: string | null
  /** 0 means no Deposit Refund to follow. */
  refund: number
  refund_due: string | null
}

/** `rental` is the row as the database has it, read by the action — never
 *  hidden fields — so the bounds below are the real ones. */
export function parseEndRentalForm(
  form: FormLike,
  rental: { startDate: string; deposit: number },
  today: string = todayBangkok(),
): Parsed<EndRentalInput> {
  const endedOn = date(form.get('ended_on'), 'End date')
  if (!endedOn.ok) return endedOn
  if (endedOn.values < rental.startDate) {
    return fail('A Rental cannot end before it started — choose a date on or after the start date')
  }
  // Ending is immediate: the Property reads Available the moment it runs. A
  // Tenant who has given notice is still in the room, so the Rental is ended
  // on the day they leave, not in advance.
  if (endedOn.values > today) {
    return fail('End a Rental on the day the Tenant leaves — pick today or an earlier date, and come back on the day for a later one')
  }

  const rawReason = cleanText(form.get('reason'), MAX_END_REASON + 1)
  if (rawReason.length > MAX_END_REASON) {
    return fail(`Keep the reason under ${MAX_END_REASON} characters`)
  }

  const refund = number(form.get('refund'), { label: 'Deposit Refund', min: 0, max: MAX_PRICE })
  if (!refund.ok) return refund
  const amount = refund.values ?? 0
  if (amount > rental.deposit) {
    return fail(`The Deposit Refund can be at most the Deposit, ${formatBaht(rental.deposit)}`)
  }

  if (amount === 0) {
    return { ok: true, values: { ended_on: endedOn.values, reason: rawReason || null, refund: 0, refund_due: null } }
  }

  const due = date(form.get('refund_due'), 'Refund due date')
  if (!due.ok) return due
  if (due.values < endedOn.values) return fail('The Deposit Refund cannot be due before the Rental ends')

  return {
    ok: true,
    values: { ended_on: endedOn.values, reason: rawReason || null, refund: amount, refund_due: due.values },
  }
}

export interface RenewRentalInput {
  /** The day after the current Rental ends — computed, not posted. renew_rental
   *  (0017) derives the same date itself; this is for the schedule. */
  start_date: string
  end_date: string
  monthly_rent: number
  commission: number
}

export function parseRenewForm(
  form: FormLike,
  rental: { endDate: string; rentedByUs: boolean; rentTrackedByUs: boolean },
): Parsed<RenewRentalInput> {
  const start_date = addDaysIso(rental.endDate, 1)

  const end = date(form.get('end_date'), 'New end date')
  if (!end.ok) return end
  if (end.values <= rental.endDate) return fail('The new end date must be after the current one')

  // Renewing a let-elsewhere Rental moves its estimated end; there is still no
  // money on it.
  if (!rental.rentedByUs && !rental.rentTrackedByUs) {
    return { ok: true, values: { start_date, end_date: end.values, monthly_rent: 0, commission: 0 } }
  }

  const rent = number(form.get('monthly_rent'), {
    label: 'Rent per month',
    min: 0,
    max: MAX_PRICE,
    required: true,
  })
  if (!rent.ok) return rent
  const monthly_rent = rent.values ?? 0
  if (rental.rentTrackedByUs && monthly_rent <= 0) {
    return fail('Rent per month must be above 0 when the rent is followed')
  }

  const commission = number(form.get('commission'), { label: 'Commission', min: 0, max: MAX_PRICE })
  if (!commission.ok) return commission
  if ((commission.values ?? 0) > 0 && !rental.rentedByUs) {
    return fail('Commission is only charged on a Rental we let. Set it to 0.')
  }

  return {
    ok: true,
    values: { start_date, end_date: end.values, monthly_rent, commission: commission.values ?? 0 },
  }
}

// ─── Plumbing ────────────────────────────────────────────────────────────────

function ticked(input: unknown): boolean {
  return input === 'on' || input === 'true' || input === '1'
}

function date(input: unknown, label: string): Parsed<string> {
  const raw = cleanText(input, 20)
  if (!raw) return fail(`${label} is required`)
  if (!isIsoDate(raw)) return fail(`${label} must be a date`)
  return { ok: true, values: raw }
}
