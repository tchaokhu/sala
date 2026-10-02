'use server'

import { revalidatePath } from 'next/cache'
import { createClient, requireMember } from '@/lib/supabase-server'
import { cleanText } from '@/lib/validate'
import { parsePlatformForm } from '@/lib/platform-input'
import type { ActionResult } from '@/lib/action-result'

// Managing Platforms — the channels an Org advertises on. Ordinary Member
// writes: each establishes Membership first and the Org comes from that gate,
// never from the form (ADR 0002).
//
// There is deliberately no delete action. A Platform with Postings cannot be
// removed — `postings.platform_id` is ON DELETE RESTRICT (0011) — and one
// without them is still history somebody may want back. Retiring it is the
// whole story, and the database agrees.

/** Unique violation. The only constraint on `platforms` a person can trip is
 *  the per-Org name index, so this maps to one message rather than a lookup. */
const DUPLICATE = '23505'

function failed(what: string, err: unknown): ActionResult {
  console.error(`[platforms] ${what}:`, err)
  return {
    ok: false,
    message: `${what} failed. Try again, and tell your administrator if it keeps failing.`,
  }
}

function refreshed(slug: string) {
  revalidatePath(`/o/${slug}/platforms`)
  // The tick-list on the Property form reads the same list.
  revalidatePath(`/o/${slug}/properties`)
}

export async function createPlatform(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  if (!slug) return { ok: false, message: 'Org not found' }

  const org = await requireMember(slug)
  const parsed = parsePlatformForm(formData)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  const { error } = await supabase
    .from('platforms')
    .insert({ ...parsed.values, org_id: org.id })

  if (error?.code === DUPLICATE) {
    return { ok: false, message: `You already have a channel called ${parsed.values.name}` }
  }
  if (error) return failed('Adding the channel', error)

  refreshed(slug)
  return { ok: true, message: 'Channel added', detail: parsed.values.name }
}

export async function updatePlatform(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  const id = cleanText(formData.get('platform_id'), 40)
  if (!slug || !id) return { ok: false, message: 'The request was incomplete. Try again.' }

  const org = await requireMember(slug)
  const parsed = parsePlatformForm(formData)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  // org_id in the filter as well as RLS: the policy already refuses another
  // Org's row, and this makes the refusal a zero-row update rather than
  // relying on it alone.
  const { error } = await supabase
    .from('platforms')
    .update(parsed.values)
    .eq('id', id)
    .eq('org_id', org.id)

  if (error?.code === DUPLICATE) {
    return { ok: false, message: `You already have a channel called ${parsed.values.name}` }
  }
  if (error) return failed('Saving the channel', error)

  refreshed(slug)
  return { ok: true, message: 'Channel saved', detail: parsed.values.name }
}

/**
 * Retire a channel, or bring it back.
 *
 * An inactive Platform drops off the tick-list on the Property form and keeps
 * every Posting that names it readable in the Properties table. Nothing is
 * lost and nothing is hidden — which is why this exists instead of a delete.
 */
export async function setPlatformActive(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  const id = cleanText(formData.get('platform_id'), 40)
  if (!slug || !id) return { ok: false, message: 'The request was incomplete. Try again.' }

  const active = cleanText(formData.get('active'), 8) === 'true'

  const org = await requireMember(slug)
  const supabase = await createClient()
  const { error } = await supabase
    .from('platforms')
    .update({ active })
    .eq('id', id)
    .eq('org_id', org.id)
  if (error) return failed(active ? 'Restoring the channel' : 'Retiring the channel', error)

  refreshed(slug)
  return {
    ok: true,
    message: active ? 'Channel restored' : 'Channel retired',
    detail: active
      ? 'It is back on the Property form'
      : 'Rooms already posted there still show it',
  }
}
