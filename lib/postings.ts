// Postings — the fact that one Property is advertised on one Platform.
//
// A row exists only where the advertisement does (0011). There is no
// `posted boolean` to set false: un-ticking a channel deletes the row, and a
// Property with no rows is a Property nobody is marketing, which is the whole
// question this table answers.
//
// The diff below is a pure function on purpose. Deciding what changed is the
// judgement, and it should be testable without a database; `savePostings` is
// the thin part that carries the decision to Postgres.

import { createClient } from './supabase-server'
import { ownedPlatformIds } from './platforms'
import { todayBangkok } from './dates'

export const MAX_POST_URL = 2000

export interface PostingRow {
  platformId: string
  platformName: string
  postUrl: string | null
  /** ISO date, Bangkok terms. */
  postedOn: string
}

/** What the form says the Postings should now be. No `platformName`: the name
 *  is the Platform's, and a form that posted one would be inventing it. */
export interface PostingInput {
  platformId: string
  postUrl: string | null
  postedOn: string
}

export interface PostingDiff {
  insert: PostingInput[]
  update: PostingInput[]
  removePlatformIds: string[]
}

/**
 * What changed between the stored Postings and what the form submitted.
 *
 * Unchanged rows appear in none of the three lists, so saving a tick-list
 * nobody touched writes nothing at all.
 */
export function diffPostings(current: PostingRow[], next: PostingInput[]): PostingDiff {
  const before = new Map(current.map((p) => [p.platformId, p]))
  const after = new Map(next.map((p) => [p.platformId, p]))

  const insert: PostingInput[] = []
  const update: PostingInput[] = []

  for (const [platformId, wanted] of after) {
    const existing = before.get(platformId)
    if (!existing) {
      insert.push(wanted)
    } else if (existing.postUrl !== wanted.postUrl || existing.postedOn !== wanted.postedOn) {
      update.push(wanted)
    }
  }

  const removePlatformIds = [...before.keys()].filter((id) => !after.has(id))

  return { insert, update, removePlatformIds }
}

export async function listPostingsForProperty(
  orgId: string,
  propertyId: string,
): Promise<PostingRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('postings')
    .select('platform_id, post_url, posted_on, platforms(name)')
    .eq('org_id', orgId)
    .eq('property_id', propertyId)
  if (error) throw error

  const rows = (data ?? []) as {
    platform_id: string
    post_url: string | null
    posted_on: string
    // PostgREST returns a to-one embed as an object or an array depending on
    // how it inferred the relationship. Same normalisation as elsewhere.
    platforms: { name: string } | { name: string }[] | null
  }[]

  return rows
    .map((p) => {
      const embedded = Array.isArray(p.platforms) ? p.platforms[0] : p.platforms
      return {
        platformId: p.platform_id,
        platformName: embedded?.name ?? '',
        postUrl: p.post_url,
        postedOn: p.posted_on,
      }
    })
    .sort((a, b) => a.platformName.localeCompare(b.platformName))
}

/** Raised when the form named a Platform this Org does not have. Its own type
 *  so the action can answer with copy rather than a database message. */
export class UnknownPlatformError extends Error {
  constructor() {
    super('unknown platform')
    this.name = 'UnknownPlatformError'
  }
}

/**
 * Make the stored Postings match what the form submitted.
 *
 * One statement per kind of change, never one per row, and nothing at all when
 * nothing changed. Every posted `platformId` is checked against the Org's own
 * Platforms before a single write — RLS would refuse a foreign row anyway, but
 * a refusal the caller can read beats a constraint violation they cannot.
 */
export async function savePostings(
  orgId: string,
  propertyId: string,
  next: PostingInput[],
): Promise<PostingDiff> {
  const wantedIds = next.map((p) => p.platformId)
  const owned = await ownedPlatformIds(orgId, wantedIds)
  if (wantedIds.some((id) => !owned.has(id))) throw new UnknownPlatformError()

  const current = await listPostingsForProperty(orgId, propertyId)
  const diff = diffPostings(current, next)
  const supabase = await createClient()

  if (diff.removePlatformIds.length) {
    const { error } = await supabase
      .from('postings')
      .delete()
      .eq('org_id', orgId)
      .eq('property_id', propertyId)
      .in('platform_id', diff.removePlatformIds)
    if (error) throw error
  }

  if (diff.insert.length) {
    const { error } = await supabase.from('postings').insert(
      diff.insert.map((p) => ({
        org_id: orgId,
        property_id: propertyId,
        platform_id: p.platformId,
        post_url: p.postUrl,
        posted_on: p.postedOn,
      })),
    )
    if (error) throw error
  }

  // An update per changed row: there are at most as many as the Org has
  // Platforms, and PostgREST has no way to set different values per row in one
  // statement that does not amount to an upsert of the unchanged ones too.
  for (const p of diff.update) {
    const { error } = await supabase
      .from('postings')
      .update({ post_url: p.postUrl, posted_on: p.postedOn })
      .eq('org_id', orgId)
      .eq('property_id', propertyId)
      .eq('platform_id', p.platformId)
    if (error) throw error
  }

  return diff
}

/**
 * Read the tick-list off a form.
 *
 * The checklist posts one `postings` field holding a JSON array rather than a
 * field per Platform id, so the action does not have to guess which of the
 * form's keys are platform ids. Anything malformed is treated as an empty
 * tick-list rather than throwing: the caller has already established
 * Membership, and a mangled field should not take a Property edit down with it.
 */
export function parsePostingsField(raw: unknown, today: string = todayBangkok()): PostingInput[] {
  if (typeof raw !== 'string' || raw.trim() === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const seen = new Set<string>()
  const out: PostingInput[] = []
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue
    const e = entry as Record<string, unknown>
    const platformId = typeof e.platformId === 'string' ? e.platformId.trim() : ''
    if (!platformId || seen.has(platformId)) continue
    seen.add(platformId)

    const url = typeof e.postUrl === 'string' ? e.postUrl.trim().slice(0, MAX_POST_URL) : ''
    const on = typeof e.postedOn === 'string' ? e.postedOn.trim() : ''
    out.push({
      platformId,
      postUrl: url || null,
      postedOn: /^\d{4}-\d{2}-\d{2}$/.test(on) ? on : today,
    })
  }
  return out
}
