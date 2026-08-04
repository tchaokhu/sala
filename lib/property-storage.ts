// The bucket a Property's photos live in, and the two things every action that
// touches them needs: a best-effort sweep, and readable URLs.
//
// Bytes only ever move inside a Server Action, on the caller's session, so
// `storage.objects` policies check Membership against the `{org_id}` first path
// segment exactly as 0002_storage.sql wrote them (ADR 0007). Nothing here takes
// a client's word for a path: create mints them, and edit and delete read them
// back off the row.

import { createClient } from './supabase-server'

export const BUCKET = 'sala-images'

type Client = Awaited<ReturnType<typeof createClient>>

/** Best-effort removal of bytes no Property will point at. A failure here is
 *  logged and swallowed: the person's answer is already decided, and orphaned
 *  objects under a prefix nothing references are an operator's problem, not
 *  theirs. */
export async function discard(supabase: Client, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  try {
    const { error } = await supabase.storage.from(BUCKET).remove(paths)
    if (error) throw error
  } catch (err) {
    console.error('[properties] could not remove orphaned uploads:', err)
  }
}

/** Long enough to open the form, look at the photos and decide; short enough
 *  that a URL copied out of the page stops working well before it is useful to
 *  anyone. Signing happens server-side per render, so this is not a session. */
export const SIGNED_URL_TTL_SECONDS = 10 * 60

export interface PropertyImage {
  /** The stored object key — what `removed_images` posts back. */
  path: string
  /** null when this one could not be signed; the thumbnail renders as missing
   *  and stays removable. */
  url: string | null
}

/**
 * Signed URLs for a Property's stored photos, in the order the paths came in.
 *
 * One batched call rather than one per photo, and computed on the server so the
 * browser never holds a Supabase client. The bucket is private (ADR 0007), so
 * this is the only way an existing photo renders at all.
 *
 * A Storage failure returns nulls rather than throwing: this feeds an edit page
 * whose real job is the form, and losing the whole page — including the price
 * field someone came to fix — because thumbnails could not be signed is the
 * wrong trade. The detail goes to the log.
 */
export async function signedPropertyImageUrls(paths: string[]): Promise<PropertyImage[]> {
  if (paths.length === 0) return []

  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)

  if (error || !data) {
    console.error('[properties] could not sign photo urls:', error)
    return paths.map((path) => ({ path, url: null }))
  }

  // Keyed by path rather than trusting the response to come back in order: one
  // unsignable object would otherwise shift every thumbnail after it onto the
  // wrong photo, and the X beside it would then remove the wrong one.
  const signed = new Map<string, string>()
  for (const entry of data) {
    if (entry.path && entry.signedUrl && !entry.error) signed.set(entry.path, entry.signedUrl)
  }

  return paths.map((path) => ({ path, url: signed.get(path) ?? null }))
}
