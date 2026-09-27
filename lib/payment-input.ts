// What the settle and correct forms decide, with no I/O — importable from a
// client form, like lib/rental-input.ts.
//
// `payment` is always the row as the database has it, read by the action under
// the Org — never hidden fields — so "at most the outstanding" is the real
// outstanding.

import { isIsoDate, todayBangkok } from './dates'
import { formatBaht } from './format'
import { applySettlement, outstanding, type Settlement } from './payments'
import { fail, MAX_PRICE, number, type FormLike, type Parsed } from './property-input'
import { cleanText } from './validate'
import type { PaymentMethod } from '@/types'

export const PAYMENT_METHODS = ['cash', 'transfer', 'other'] as const satisfies readonly PaymentMethod[]

export const MAX_PAYMENT_NOTE = 500

type RecordedPayment = { amount: number; settled_amount: number | null; note: string | null }

/**
 * One instalment against a Payment: fields `amount`, `settled_date`, `method`,
 * `note`. Returns the running total to write (decision 1), not the instalment.
 * A blank note keeps the one already recorded.
 */
export function parseSettleForm(
  form: FormLike,
  payment: RecordedPayment,
  today: string = todayBangkok(),
): Parsed<Settlement> {
  const left = outstanding(payment)
  if (left <= 0) return fail('This Payment is already settled in full. Use Correct to change what was recorded.')

  const amount = number(form.get('amount'), { label: 'Amount', min: 0, max: MAX_PRICE, required: true })
  if (!amount.ok) return amount
  const value = amount.values ?? 0
  if (value <= 0) return fail('Amount must be above 0')
  if (value > left) return fail(`Amount can be at most what is still owed, ${formatBaht(left)}`)

  const rest = parseCommon(form, today)
  if (!rest.ok) return rest

  return { ok: true, values: applySettlement(payment, { amount: value, ...rest.values }) }
}

/**
 * Replacing what was recorded (decision 4): the same fields, but `amount` is
 * the total settled so far rather than one more instalment, and a blank note
 * clears it. Taking it to nothing is Clear, not a zero here.
 */
export function parseCorrectForm(
  form: FormLike,
  payment: Pick<RecordedPayment, 'amount'>,
  today: string = todayBangkok(),
): Parsed<Settlement> {
  const amount = number(form.get('amount'), { label: 'Amount settled', min: 0, max: MAX_PRICE, required: true })
  if (!amount.ok) return amount
  const value = amount.values ?? 0
  if (value <= 0) return fail('Amount settled must be above 0 — to remove the settlement, use Clear this settlement')
  if (value > payment.amount) return fail(`Amount settled can be at most the Payment, ${formatBaht(payment.amount)}`)

  const rest = parseCommon(form, today)
  if (!rest.ok) return rest

  return {
    ok: true,
    values: { settled_amount: value, settled_date: rest.values.date, method: rest.values.method, note: rest.values.note },
  }
}

function parseCommon(
  form: FormLike,
  today: string,
): Parsed<{ date: string; method: PaymentMethod; note: string | null }> {
  const date = cleanText(form.get('settled_date'), 20)
  if (!date) return fail('Date is required')
  if (!isIsoDate(date)) return fail('Date must be a date')
  // No lower bound: paying ahead of the due date is normal.
  if (date > today) return fail('Record money on the day it arrived — pick today or an earlier date')

  const method = form.get('method')
  if (!isPaymentMethod(method)) return fail('Choose how it was paid: cash, transfer or other')

  const note = cleanText(form.get('note'), MAX_PAYMENT_NOTE + 1)
  if (note.length > MAX_PAYMENT_NOTE) return fail(`Keep the note under ${MAX_PAYMENT_NOTE} characters`)

  return { ok: true, values: { date, method, note: note || null } }
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value)
}
