'use server'

import { revalidatePath } from 'next/cache'
import { createClient, requireMember } from '@/lib/supabase-server'
import { cleanText } from '@/lib/validate'
import { parseOwnerForm } from '@/lib/owner-input'
import type { ActionResult } from '@/lib/action-result'

// Managing Owners. An ordinary Member write: Membership first, and the Org it
// writes into comes from that gate rather than from the form (ADR 0002). The
// service role is nowhere near this.
//
// Create only, for this first cut — no edit, no delete. A typo sits there until
// the follow-up ships; that is an accepted gap. Nothing here writes
// `owners.source` either: the column exists and has no meaning yet.

function failed(what: string, err: unknown): ActionResult {
  console.error(`[owners] ${what}:`, err)
  return { ok: false, message: `${what} failed. Try again, and tell your administrator if it keeps failing.` }
}

/** Stays on the page rather than redirecting: the Owners page is where a person
 *  works through a list of people, and being thrown somewhere else after each
 *  one would be the wrong end of the job. Same shape as `updateBuilding`. */
export async function createOwner(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  if (!slug) return { ok: false, message: 'Org not found' }

  const org = await requireMember(slug)
  const parsed = parseOwnerForm(formData)
  if (!parsed.ok) return parsed

  const supabase = await createClient()

  const { error } = await supabase.from('owners').insert({ ...parsed.values, org_id: org.id })
  if (error) return failed('Adding the Owner', error)

  revalidatePath(`/o/${slug}/owners`)
  // The Property forms read the same list for their Owner picker.
  revalidatePath(`/o/${slug}/properties/new`)
  return { ok: true, message: `Added Owner ${parsed.values.name}` }
}
