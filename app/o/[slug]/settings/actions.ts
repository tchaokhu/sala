'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient, requireMember } from '@/lib/supabase-server'
import { cleanText, isEmail } from '@/lib/validate'
import type { ActionResult } from '@/lib/action-result'

// What a person may change about themselves. Both actions begin by establishing
// Membership (ADR 0002) and neither goes near the service role — a member
// renaming themselves is an ordinary write by an ordinary caller.
//
// Nothing here can change anybody else. `set_my_display_name` matches on
// auth.uid() inside the database, so the Org slug is the only thing this code
// supplies and there is no user id to get wrong.

export async function renameSelf(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  const name = cleanText(formData.get('display_name'), 80)
  if (!slug) return { ok: false, message: 'Org not found' }

  const org = await requireMember(slug)
  const supabase = await createClient()

  const { error } = await supabase.rpc('set_my_display_name', {
    p_org: org.id,
    p_name: name,
  })
  if (error) {
    console.error('[settings] renameSelf:', error)
    return { ok: false, message: 'Saving your name failed. Try again.' }
  }

  revalidatePath(`/o/${slug}/settings`)
  return {
    ok: true,
    message: name ? `Your name is now ${name}` : 'Name cleared — your email is shown instead',
  }
}

/** Changing your own login email. Supabase confirms at both addresses before
 *  anything moves, so this reports "check your mail", never "done" — saying
 *  otherwise would leave somebody believing they had changed the address they
 *  sign in with when they had not. */
export async function changeOwnEmail(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  const email = cleanText(formData.get('email'), 254).toLowerCase()
  if (!slug) return { ok: false, message: 'Org not found' }
  if (!isEmail(email)) return { ok: false, message: 'That email is not valid. Check it and enter it again.' }

  // Establishes that the caller is who the session says, in an Org they belong
  // to, before touching their account.
  await requireMember(slug)
  const supabase = await createClient()

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')

  // The confirmation link is not started by a browser doing PKCE, so it lands on
  // /auth/confirm and is verified server-side.
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${proto}://${host}/auth/confirm?next=/o/${slug}/settings` },
  )

  if (error) {
    console.error('[settings] changeOwnEmail:', error)
    if (error.status === 422) {
      return { ok: false, message: 'An account already uses that email. Use a different one.' }
    }
    if (error.status === 429) {
      return { ok: false, message: 'Too many change requests. Wait a moment and try again.' }
    }
    return { ok: false, message: 'Changing your email failed. Try again.' }
  }

  return {
    ok: true,
    message: `A confirmation link has been sent to ${email}. Your email will not change until you confirm — Supabase sends the link to both the old address and the new one.`,
  }
}
