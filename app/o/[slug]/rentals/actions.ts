'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, currentUser, requireMember } from '@/lib/supabase-server'
import { cleanText } from '@/lib/validate'
import { formatDateThai } from '@/lib/format'
import { buildPaymentSchedule, settleThrough, type ScheduleTerms } from '@/lib/payments'
import { parseEndRentalForm, parseRenewForm, parseRentalForm } from '@/lib/rental-input'
import { getRental } from '@/lib/rentals'
import { tenantBelongsToOrg } from '@/lib/tenants'
import type { ActionResult } from '@/lib/action-result'
import { flash } from '@/lib/flash'
import { parseDocumentKind, validateDocuments } from '@/lib/document-input'
import { attachDocuments } from '@/lib/rental-documents'

// Every Rental transition — create, end, renew, delete. Membership first and the
// Org from that gate, never from the form (ADR 0002); then one call to the
// invoker function that does the whole transition in one transaction (0017,
// ADR 0014). RLS and the 0016 keys refuse another Org's ids inside it; the reads
// before it exist to turn those refusals into sentences.
//
// Tenants carry identity documents. Nothing from the form is logged, and no
// message below repeats what was typed about a Tenant (CLAUDE.md).

function failed(what: string, err: unknown): ActionResult {
  console.error(`[rentals] ${what}:`, err)
  return { ok: false, message: `${what} failed. Try again, and tell your administrator if it keeps failing.` }
}

const INCOMPLETE: ActionResult = { ok: false, message: 'The request was incomplete. Try again.' }
const NOT_FOUND: ActionResult = {
  ok: false,
  message: 'This Rental was not found — it may already have been ended or deleted. Go back to the Rentals list and try again.',
}
const NOT_ACTIVE: ActionResult = {
  ok: false,
  message: 'This Rental has already ended. Reload the page to see where it stands.',
}

interface PgError {
  code?: string
  message?: string
}

const isActiveClash = (e: PgError) =>
  e.code === '23505' && (e.message ?? '').includes('rentals_one_active_per_property')

/** The schedule as create_rental / renew_rental take it: the function stamps
 *  org_id, rental_id and property_id itself, so those are left behind — which
 *  is why the Rental id in `terms` can be a blank before the row exists. */
function scheduleJson(terms: ScheduleTerms, opts: { depositHeld?: boolean; paidThrough?: string | null }) {
  return settleThrough(buildPaymentSchedule(terms, opts), opts.paidThrough ?? null).map((p) => ({
    type: p.type,
    direction: p.direction,
    due_date: p.due_date,
    amount: p.amount,
    settled_date: p.settled_date,
    settled_amount: p.settled_amount,
  }))
}

/** The toast's second line for a new schedule. */
function scheduled(schedule: { settled_amount: number | null }[]): string {
  const due = schedule.filter((p) => !p.settled_amount).length
  return due === 0 ? 'No Payments to follow' : `${due} ${due === 1 ? 'Payment' : 'Payments'} scheduled`
}

function revalidateRental(slug: string, propertyId: string, rentalIds: string[]) {
  revalidatePath(`/o/${slug}/rentals`)
  revalidatePath(`/o/${slug}/rentals/new`)
  for (const id of rentalIds) revalidatePath(`/o/${slug}/rentals/${id}`)
  revalidatePath(`/o/${slug}/properties`)
  revalidatePath(`/o/${slug}/properties/${propertyId}`)
  revalidatePath(`/o/${slug}`)
}

export async function createRental(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  if (!slug) return INCOMPLETE

  const org = await requireMember(slug)
  const parsed = parseRentalForm(formData)
  if (!parsed.ok) return parsed
  const v = parsed.values

  // Documents are optional here, and judged before anything is written: a file
  // that would be refused should stop the Rental, not follow it.
  const files = formData
    .getAll('files')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0)
  const kind = files.length ? parseDocumentKind(formData) : null
  if (kind && !kind.ok) return kind
  if (files.length) {
    const valid = validateDocuments(files)
    if (!valid.ok) return valid
  }

  const supabase = await createClient()

  // Both ids arrived in the form; each is checked against the Org before the
  // write, as the caller, under RLS. Independent, so together.
  let propertyFound: boolean
  let tenantFound: boolean
  try {
    ;[propertyFound, tenantFound] = await Promise.all([
      supabase
        .from('properties')
        .select('id')
        .eq('id', v.property_id)
        .eq('org_id', org.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) throw error
          return data !== null
        }),
      v.tenant_id ? tenantBelongsToOrg(org.id, v.tenant_id) : Promise.resolve(true),
    ])
  } catch (err) {
    return failed('Adding the Rental', err)
  }
  if (!propertyFound) return { ok: false, message: 'The Property you chose was not found. Choose it again.' }
  if (!tenantFound) return { ok: false, message: 'The Tenant you chose was not found. Choose them again.' }

  const schedule = scheduleJson(
    {
      id: '',
      org_id: org.id,
      property_id: v.property_id,
      start_date: v.start_date,
      end_date: v.end_date,
      monthly_rent: v.monthly_rent,
      deposit: v.deposit,
      commission: v.commission,
      rented_by_us: v.rented_by_us,
      rent_tracked_by_us: v.rent_tracked_by_us,
    },
    { paidThrough: v.paid_through },
  )

  const { data, error } = await supabase.rpc('create_rental', {
    p_org: org.id,
    p_property: v.property_id,
    p_tenant_id: v.tenant_id,
    p_new_tenant: v.new_tenant,
    // Both flags written explicitly, never left to the column default.
    p_rental: {
      start_date: v.start_date,
      end_date: v.end_date,
      monthly_rent: v.monthly_rent,
      deposit: v.deposit,
      commission: v.commission,
      rented_by_us: v.rented_by_us,
      rent_tracked_by_us: v.rent_tracked_by_us,
    },
    p_schedule: schedule,
  })
  if (error) {
    if (isActiveClash(error)) return { ok: false, message: 'This Property already has an active Rental.' }
    if (error.code === 'P0002') {
      return { ok: false, message: 'The Property or Tenant you chose was not found. Choose them again.' }
    }
    return failed('Adding the Rental', error)
  }

  const id = data as string
  revalidateRental(slug, v.property_id, [])

  // After the Rental exists, since its id is in every key. Its rows are still
  // written last (ADR 0007); a failure here leaves the Rental standing and says
  // so, rather than undoing a Rental that was entered correctly.
  let docs = ''
  if (kind?.ok && files.length) {
    const attached = await attachDocuments(supabase, {
      orgId: org.id,
      rentalId: id,
      kind: kind.values,
      files,
      userId: (await currentUser())?.id ?? null,
    })
    if (!attached.ok) {
      console.error('[rentals] documents on a new Rental:', attached.error)
      await flash('Rental added', 'The documents did not upload — add them below under Documents')
      redirect(`/o/${slug}/rentals/${id}`)
    }
    docs = ` · ${attached.count} ${attached.count === 1 ? 'document' : 'documents'}`
  }

  await flash('Rental added', scheduled(schedule) + docs)
  // Throws NEXT_REDIRECT, so it stays outside any try.
  redirect(`/o/${slug}/rentals/${id}`)
}

export async function endRental(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  const id = cleanText(formData.get('rental_id'), 40)
  if (!slug || !id) return INCOMPLETE

  const org = await requireMember(slug)

  // The bounds the form is judged against — start date, Deposit — are the
  // row's, not hidden fields.
  let current
  try {
    current = await getRental(org.id, id)
  } catch (err) {
    return failed('Ending the Rental', err)
  }
  if (!current) return NOT_FOUND
  if (current.status !== 'active') return NOT_ACTIVE

  const parsed = parseEndRentalForm(formData, current)
  if (!parsed.ok) return parsed
  const v = parsed.values

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('end_rental', {
    p_org: org.id,
    p_rental: id,
    p_ended_on: v.ended_on,
    p_reason: v.reason,
    p_refund: v.refund,
    p_refund_due: v.refund_due,
  })
  if (error) {
    if (error.code === 'P0002') return NOT_ACTIVE
    return failed('Ending the Rental', error)
  }

  revalidateRental(slug, current.propertyId, [id])
  const deleted = Number(data)
  const on = formatDateThai(v.ended_on)
  return {
    ok: true,
    message: 'Rental ended',
    detail:
      deleted === 0
        ? `On ${on} · no unpaid Payments were due after it`
        : `On ${on} · ${deleted} future ${deleted === 1 ? 'Payment' : 'Payments'} removed`,
  }
}

export async function renewRental(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  const id = cleanText(formData.get('rental_id'), 40)
  if (!slug || !id) return INCOMPLETE

  const org = await requireMember(slug)

  let current
  try {
    current = await getRental(org.id, id)
  } catch (err) {
    return failed('Renewing the Rental', err)
  }
  if (!current) return NOT_FOUND
  if (current.status !== 'active') return NOT_ACTIVE

  const parsed = parseRenewForm(formData, current)
  if (!parsed.ok) return parsed
  const v = parsed.values

  // The Deposit is still with the Owner from the Rental being renewed, so the
  // next schedule has no Deposit line; the Commission is billed again.
  const schedule = scheduleJson(
    {
      id: '',
      org_id: org.id,
      property_id: current.propertyId,
      start_date: v.start_date,
      end_date: v.end_date,
      monthly_rent: v.monthly_rent,
      deposit: current.deposit,
      commission: v.commission,
      rented_by_us: current.rentedByUs,
      rent_tracked_by_us: current.rentTrackedByUs,
    },
    { depositHeld: true },
  )

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('renew_rental', {
    p_org: org.id,
    p_rental: id,
    p_next: { end_date: v.end_date, monthly_rent: v.monthly_rent, commission: v.commission },
    p_schedule: schedule,
  })
  if (error) {
    if (error.code === 'P0002') return NOT_ACTIVE
    if (isActiveClash(error)) return { ok: false, message: 'This Property already has an active Rental.' }
    return failed('Renewing the Rental', error)
  }

  const next = data as string
  revalidateRental(slug, current.propertyId, [id])
  await flash('Rental renewed', scheduled(schedule))
  redirect(`/o/${slug}/rentals/${next}`)
}

/**
 * Removing a Rental entered by mistake. delete_rental (0017) refuses once any
 * Payment under it is settled or a Rental Document is attached — by then it is
 * history, and history is ended rather than erased. Those refusals come back as
 * their own SQLSTATEs, so there is no read before the call.
 */
export async function deleteRental(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  const id = cleanText(formData.get('rental_id'), 40)
  if (!slug || !id) return INCOMPLETE

  const org = await requireMember(slug)
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('delete_rental', { p_org: org.id, p_rental: id })
  if (error) {
    if (error.code === 'SL001') {
      return {
        ok: false,
        message: 'This Rental cannot be deleted: a Payment under it is settled. End it instead.',
      }
    }
    if (error.code === 'SL002') {
      return {
        ok: false,
        message: 'This Rental cannot be deleted: a Rental Document is attached. End it instead.',
      }
    }
    if (error.code === 'P0002') return NOT_FOUND
    return failed('Deleting the Rental', error)
  }

  revalidateRental(slug, data as string, [id])
  await flash('Rental deleted')
  redirect(`/o/${slug}/rentals`)
}
