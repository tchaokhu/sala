'use server'

import { revalidatePath } from 'next/cache'
import { createClient, requireMember } from '@/lib/supabase-server'
import { cleanText } from '@/lib/validate'
import { parseBuildingForm } from '@/lib/building-input'
import { resolveMapUrl } from '@/lib/google-map-resolve'
import type { ActionResult } from '@/lib/action-result'

// Managing Buildings. Ordinary Member writes: each one establishes Membership
// first and the Org comes from that gate, never from the form (ADR 0002). The
// service role is nowhere near this.
//
// The map link is resolved here rather than in the pure parser because
// following a redirect is I/O — see lib/google-map-resolve.ts and ADR 0008.

function failed(what: string, err: unknown): ActionResult {
  console.error(`[buildings] ${what}:`, err)
  return { ok: false, message: `${what} failed. Try again, and tell your administrator if it keeps failing.` }
}

export async function createBuilding(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  if (!slug) return { ok: false, message: 'Org not found' }

  const org = await requireMember(slug)
  const parsed = parseBuildingForm(formData)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  const google_map_url = await resolveMapUrl(parsed.values.google_map_url)

  const { error } = await supabase
    .from('buildings')
    .insert({ ...parsed.values, google_map_url, org_id: org.id })
  if (error) return failed('Adding the Building', error)

  revalidatePath(`/o/${slug}/buildings`)
  // The Property form reads the same list.
  revalidatePath(`/o/${slug}/properties/new`)
  return { ok: true, message: `Added Building ${parsed.values.name}` }
}

export async function updateBuilding(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  const id = cleanText(formData.get('building_id'), 40)
  if (!slug || !id) return { ok: false, message: 'The request was incomplete. Try again.' }

  const org = await requireMember(slug)
  const parsed = parseBuildingForm(formData)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  const google_map_url = await resolveMapUrl(parsed.values.google_map_url)

  // org_id in the filter as well as RLS: the policy already refuses another
  // Org's row, and this makes the refusal a zero-row update rather than relying
  // on it alone.
  const { error } = await supabase
    .from('buildings')
    .update({ ...parsed.values, google_map_url })
    .eq('id', id)
    .eq('org_id', org.id)
  if (error) return failed('Saving the Building', error)

  revalidatePath(`/o/${slug}/buildings`)
  revalidatePath(`/o/${slug}/properties/new`)
  return { ok: true, message: 'Saved' }
}

/**
 * Removing a Building.
 *
 * `properties.building_id` is ON DELETE SET NULL, so the Properties inside it
 * survive — they keep the title they were given and lose the link to the
 * building's map and district. That is what the confirmation says, with the
 * number, before the button will do anything (CLAUDE.md).
 */
export async function deleteBuilding(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  const id = cleanText(formData.get('building_id'), 40)
  if (!slug || !id) return { ok: false, message: 'The request was incomplete. Try again.' }

  const org = await requireMember(slug)
  const supabase = await createClient()

  const { error } = await supabase.from('buildings').delete().eq('id', id).eq('org_id', org.id)
  if (error) return failed('Deleting the Building', error)

  revalidatePath(`/o/${slug}/buildings`)
  revalidatePath(`/o/${slug}/properties/new`)
  return { ok: true, message: 'Building deleted. The Properties that were in it are still here.' }
}
