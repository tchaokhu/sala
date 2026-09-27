'use server'

import { revalidatePath } from 'next/cache'
import { createClient, requireMember } from '@/lib/supabase-server'
import { cleanText } from '@/lib/validate'
import { formatBaht, formatDateThai } from '@/lib/format'
import { outstanding, type Settlement } from '@/lib/payments'
import { parseCorrectForm, parseSettleForm } from '@/lib/payment-input'
import { getPayment, type PaymentListRow } from '@/lib/payments-data'
import type { ActionResult } from '@/lib/action-result'

// Settling, correcting and clearing a Payment. Each is one row's UPDATE, atomic
// on its own, so no RPC (ADR 0014's reason is several tables at once). The
// Payment is read under the Org before it is written, so the bounds a form is
// judged against are the row's, and the write filters by id and org_id besides
// RLS. Any Member may do all three — Role only governs Membership.
//
// Fields: `slug`, `payment_id`; settle and correct add `amount`,
// `settled_date`, `method`, `note`.

function failed(what: string, err: unknown): ActionResult {
  console.error(`[payments] ${what}:`, err)
  return { ok: false, message: `${what} failed. Try again, and tell your administrator if it keeps failing.` }
}

const INCOMPLETE: ActionResult = { ok: false, message: 'The request was incomplete. Try again.' }
const NOT_FOUND: ActionResult = {
  ok: false,
  message: 'This Payment was not found — its Rental may have been ended or deleted. Reload the page and try again.',
}

type Loaded = { ok: true; slug: string; orgId: string; payment: PaymentListRow } | { ok: false; result: ActionResult }

async function load(formData: FormData, what: string): Promise<Loaded> {
  const slug = cleanText(formData.get('slug'), 40)
  const id = cleanText(formData.get('payment_id'), 40)
  if (!slug || !id) return { ok: false, result: INCOMPLETE }

  const org = await requireMember(slug)
  try {
    const payment = await getPayment(org.id, id)
    if (!payment) return { ok: false, result: NOT_FOUND }
    return { ok: true, slug, orgId: org.id, payment }
  } catch (err) {
    return { ok: false, result: failed(what, err) }
  }
}

type Columns = Settlement | { settled_amount: null; settled_date: null; method: null }

/** Null when the row vanished between the read and the write. */
async function write(orgId: string, id: string, values: Columns): Promise<{ error: unknown } | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('payments')
    .update(values)
    .eq('id', id)
    .eq('org_id', orgId)
    .select('id')
    .maybeSingle()
  if (error) return { error }
  return data ? { error: null } : null
}

function revalidate(slug: string, rentalId: string) {
  revalidatePath(`/o/${slug}/payments`)
  revalidatePath(`/o/${slug}/rentals/${rentalId}`)
  revalidatePath(`/o/${slug}`)
}

export async function settlePayment(formData: FormData): Promise<ActionResult> {
  const loaded = await load(formData, 'Recording the payment')
  if (!loaded.ok) return loaded.result
  const { slug, orgId, payment } = loaded

  const parsed = parseSettleForm(formData, payment)
  if (!parsed.ok) return parsed
  const v = parsed.values

  const res = await write(orgId, payment.id, v)
  if (!res) return NOT_FOUND
  if (res.error) return failed('Recording the payment', res.error)

  revalidate(slug, payment.rental_id)
  const left = outstanding({ amount: payment.amount, settled_amount: v.settled_amount })
  const added = v.settled_amount - (payment.settled_amount ?? 0)
  return {
    ok: true,
    message:
      left > 0
        ? `Recorded ${formatBaht(added)} on ${formatDateThai(v.settled_date)}. ${formatBaht(left)} still to go.`
        : `Settled in full on ${formatDateThai(v.settled_date)}.`,
  }
}

export async function correctSettlement(formData: FormData): Promise<ActionResult> {
  const loaded = await load(formData, 'Correcting the settlement')
  if (!loaded.ok) return loaded.result
  const { slug, orgId, payment } = loaded
  if (payment.settled_amount === null) {
    return { ok: false, message: 'Nothing is recorded on this Payment yet. Use Settle instead.' }
  }

  const parsed = parseCorrectForm(formData, payment)
  if (!parsed.ok) return parsed
  const v = parsed.values

  const res = await write(orgId, payment.id, v)
  if (!res) return NOT_FOUND
  if (res.error) return failed('Correcting the settlement', res.error)

  revalidate(slug, payment.rental_id)
  return {
    ok: true,
    message: `Corrected: ${formatBaht(v.settled_amount)} of ${formatBaht(payment.amount)} settled, as of ${formatDateThai(v.settled_date)}.`,
  }
}

/**
 * The three settlement columns go to null together (0001's CHECK pairs the
 * first two). The note stays: it may say something about the Payment that is
 * not about the settlement — six of cozy-keys' rows carried one before
 * anything here could settle — and Correct is where a note is edited.
 */
export async function clearSettlement(formData: FormData): Promise<ActionResult> {
  const loaded = await load(formData, 'Clearing the settlement')
  if (!loaded.ok) return loaded.result
  const { slug, orgId, payment } = loaded
  if (payment.settled_amount === null) {
    return { ok: false, message: 'Nothing is recorded on this Payment. Reload the page to see where it stands.' }
  }

  const res = await write(orgId, payment.id, { settled_amount: null, settled_date: null, method: null })
  if (!res) return NOT_FOUND
  if (res.error) return failed('Clearing the settlement', res.error)

  revalidate(slug, payment.rental_id)
  return {
    ok: true,
    message: `Cleared ${formatBaht(payment.settled_amount)} recorded on ${formatDateThai(payment.settled_date)}.`,
  }
}
