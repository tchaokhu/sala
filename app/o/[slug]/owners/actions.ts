'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, requireMember } from '@/lib/supabase-server'
import { cleanText } from '@/lib/validate'
import { parseOwnerForm } from '@/lib/owner-input'
import type { ActionResult } from '@/lib/action-result'

// Managing Owners, the way Buildings are managed. An ordinary Member write:
// Membership first, and the Org it writes into comes from that gate rather than
// from the form (ADR 0002). The service role is nowhere near this. Nothing here
// writes `owners.source` either: the column exists and has no meaning yet.

function failed(what: string, err: unknown): ActionResult {
  console.error(`[owners] ${what}:`, err)
  return { ok: false, message: `${what} failed. Try again, and tell your administrator if it keeps failing.` }
}

function revalidate(slug: string) {
  revalidatePath(`/o/${slug}/owners`)
  // The Property forms read the same list for their Owner picker.
  revalidatePath(`/o/${slug}/properties/new`)
}

/** Lands on the new Owner's page, as adding a Building does. */
export async function createOwner(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  if (!slug) return { ok: false, message: 'Org not found' }

  const org = await requireMember(slug)
  const parsed = parseOwnerForm(formData)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('owners')
    .insert({ ...parsed.values, org_id: org.id })
    .select('id')
    .single()
  if (error) return failed('Adding the Owner', error)

  revalidate(slug)
  // Outside any try: redirect() works by throwing.
  redirect(`/o/${slug}/owners/${(data as { id: string }).id}?created=1`)
}

export async function updateOwner(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  const id = cleanText(formData.get('owner_id'), 40)
  if (!slug || !id) return { ok: false, message: 'The request was incomplete. Try again.' }

  const org = await requireMember(slug)
  const parsed = parseOwnerForm(formData)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  // org_id in the filter as well as RLS, as updateBuilding does.
  const { error } = await supabase
    .from('owners')
    .update({ ...parsed.values, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', org.id)
  if (error) return failed('Saving the Owner', error)

  revalidate(slug)
  revalidatePath(`/o/${slug}/owners/${id}`)
  return { ok: true, message: 'Saved' }
}

/**
 * Delete an Owner. `properties.owner_id` is ON DELETE SET NULL, so the
 * Properties they owned stay and read "No Owner on file" — which is what the
 * confirmation says, with the number, before the button does anything.
 */
export async function deleteOwner(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  const id = cleanText(formData.get('owner_id'), 40)
  if (!slug || !id) return { ok: false, message: 'The request was incomplete. Try again.' }

  const org = await requireMember(slug)
  const supabase = await createClient()

  const { error } = await supabase.from('owners').delete().eq('id', id).eq('org_id', org.id)
  if (error) return failed('Deleting the Owner', error)

  revalidate(slug)
  // Their own page is gone, so the answer is said on the list.
  redirect(`/o/${slug}/owners?deleted=1`)
}
