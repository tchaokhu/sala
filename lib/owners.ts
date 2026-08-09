// Reading Owners — the person who owns a Property and entrusts it to the Org
// (CONTEXT.md), which has nothing to do with the `owner` Role.
//
// Deliberately the same shape as lib/buildings.ts, because an Owner is the same
// kind of thing to a Property: an org-scoped record the Property points at by
// id, picked on the Property form and managed on a page of its own.
//
// Three readers with different jobs:
//   * `listOwnerOptions` fills the picker on the Property form. Name and phone,
//     because two Owners called สมชาย are told apart by the number beside them
//     and nothing else.
//   * `listOwners` is the management page: the same people plus how many
//     Properties each one holds, counted in Postgres (CLAUDE.md) rather than by
//     downloading Properties and grouping them here.
//   * `ownerBelongsToOrg` is the check every write does before it stores an
//     owner_id that arrived in a form.
//
// All three are org-scoped through `requireMember`'s Org id, with RLS behind
// that. Nothing here writes: unlike Buildings, the Property form cannot create
// an Owner — `owners.phone` is NOT NULL, and a name typed into a combobox
// cannot produce a legal row.

import { createClient } from './supabase-server'
import { decodeCursor, encodeCursor } from './cursor'
import { keysetFilter } from './properties'

/** Enough Owners for any agency this product is for, and a bound rather than no
 *  bound. `capped` is what the form says out loud when it is reached, so an
 *  Owner missing from the picker reads as "there are more than this" instead of
 *  "they are gone". Its own constant rather than Buildings' — the two lists grow
 *  for different reasons and should be free to move apart. */
export const OPTIONS_LIMIT = 500
export const OWNERS_PAGE_SIZE = 25

/** What the Property form's picker renders: "name — phone". */
export interface OwnerOption {
  id: string
  name: string
  phone: string
}

export async function listOwnerOptions(
  orgId: string,
): Promise<{ options: OwnerOption[]; capped: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('owners')
    .select('id, name, phone')
    .eq('org_id', orgId)
    .order('name', { ascending: true })
    .limit(OPTIONS_LIMIT)
  if (error) throw error

  const rows = (data ?? []) as { id: string; name: string; phone: string }[]

  return {
    options: rows.map((o) => ({ id: o.id, name: o.name, phone: o.phone })),
    capped: rows.length === OPTIONS_LIMIT,
  }
}

export interface OwnerRow extends OwnerOption {
  email: string | null
  lineId: string | null
  facebookUrl: string | null
  note: string | null
  /** How many Properties name this Owner. */
  propertyCount: number
}

export interface OwnerPage {
  rows: OwnerRow[]
  nextCursor: string | null
}

/**
 * One page of an Org's Owners, newest first, optionally filtered.
 *
 * Same keyset shape as the Building and Property lists — a limit and a cursor,
 * never an OFFSET. The Property count rides along as a PostgREST embedded
 * aggregate, so it is one query with a GROUP BY in the database rather than a
 * count per row.
 *
 * The search matches phone as well as name for the same reason the picker shows
 * both: the number is what tells two people with one name apart, and it is what
 * an agent has in front of them when they go looking.
 */
export async function listOwners(
  orgId: string,
  opts: { search?: string | null; cursor?: string | null; limit?: number } = {},
): Promise<OwnerPage> {
  const limit = opts.limit ?? OWNERS_PAGE_SIZE
  const after = decodeCursor(opts.cursor)
  const supabase = await createClient()

  let query = supabase
    .from('owners')
    .select('id, name, phone, email, line_id, facebook_url, note, created_at, properties(count)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)

  const search = (opts.search ?? '').trim()
  // PostgREST reads * as the wildcard in `ilike`; the % and _ a person types are
  // literal to it, but the commas and parens that would break out of the filter
  // grammar are not, so the term is stripped of them before it goes anywhere.
  if (search) {
    const term = search.replace(/[,()*]/g, '')
    query = query.or(`name.ilike.*${term}*,phone.ilike.*${term}*`)
  }
  // A second `or` rather than a combined one: PostgREST ANDs repeated filters,
  // which is what the keyset needs — every row after the cursor *and* matching
  // the search.
  if (after) query = query.or(keysetFilter(after))

  const { data, error } = await query
  if (error) throw error

  const records = (data ?? []) as {
    id: string
    name: string
    phone: string
    email: string | null
    line_id: string | null
    facebook_url: string | null
    note: string | null
    created_at: string
    properties: { count: number }[] | null
  }[]

  const page = records.slice(0, limit)
  const last = page.at(-1)
  const nextCursor =
    records.length > limit && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null

  return {
    rows: page.map((o) => ({
      id: o.id,
      name: o.name,
      phone: o.phone,
      email: o.email,
      lineId: o.line_id,
      facebookUrl: o.facebook_url,
      note: o.note,
      propertyCount: o.properties?.[0]?.count ?? 0,
    })),
    nextCursor,
  }
}

/**
 * Whether this Owner is one of the Org's, read as the caller.
 *
 * The point is the refusal, not the row: an `owner_id` posted from a hand-built
 * form may name an Owner in another agency's books, and the only thing standing
 * between that and a Property quietly pointing at a stranger is this check. The
 * read runs under RLS, filtered by the Org `requireMember` returned, so a
 * foreign id finds nothing and the action turns that into a refusal — the same
 * reasoning as `buildingName`.
 *
 * Nothing comes back but the answer. A Property's title derives from its
 * Building (ADR 0008), never from its Owner, so there is no name to fetch.
 */
export async function ownerBelongsToOrg(orgId: string, ownerId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('owners')
    .select('id')
    .eq('id', ownerId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  return data !== null
}
