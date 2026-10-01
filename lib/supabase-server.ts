// The server-side Supabase client and the production wiring of requireMember.
//
// This is the half of the membership gate that cannot run in a plain vitest
// process: it reads the session from request cookies and performs the org read
// as the signed-in user, so RLS does the filtering. The decision it feeds —
// return the Org, or refuse — lives in ./require-member, which stays free of any
// Next or Supabase import and is unit-tested there. This half has since run
// against the real project (ADR 0004) — a signed-in user, RLS doing the
// filtering — which is what the seam was holding open until it could.
//
// See docs/adr/0002-writes-through-server-actions.md and
// docs/adr/0004-fresh-supabase-project-cozy-keys-etl.md.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'
import {
  requireMember as decideMembership,
  type MemberGateway,
  type Org,
} from './require-member'

export { NotAMemberError, NotAuthenticatedError, type Org } from './require-member'

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

/** A Supabase client bound to the current request's cookies, holding the
 *  caller's session. Every read and every Server Action starts here; the anon
 *  key is safe in the browser and safer still on the server, because RLS — not
 *  the key — is what limits what it can see. The service role key never appears
 *  in this path (ADR 0001). */
export const createClient = cache(async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    env('NEXT_PUBLIC_SUPABASE_URL'),
    env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          // Reads happen in Server Components, where writing cookies throws.
          // The session is refreshed by middleware instead, so swallowing this
          // is correct rather than a lost write.
          try {
            for (const { name, value, options } of toSet) cookieStore.set(name, value, options)
          } catch {
            /* called from a Server Component; middleware owns the refresh */
          }
        },
      },
    },
  )
})

export type SessionUser = { id: string; email: string | null }

/** The signed-in user, or null — read from the session's JWT, verified locally
 *  against the project's ES256 signing key rather than by asking the auth
 *  server. That round-trip sat in front of every Org page, twice (proxy and
 *  layout), and is the one ADR 0015 removes. A user deleted or banned in Auth
 *  keeps a valid token until it expires (an hour at most); a Membership removed
 *  takes effect at once, because requireMember reads it from the database on
 *  every request.
 *
 *  Cached per request because the gate, the shell and some pages all want it. */
export const currentUser = cache(async function currentUser(): Promise<SessionUser | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) return null
  return { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : null }
})

/** The signed-in user as the auth server sees it right now — one round-trip.
 *  For the Superadmin console only: its actions run on the service role, so a
 *  deleted operator must lose it at once rather than when their token expires
 *  (ADR 0015). Org pages use currentUser. */
export const verifiedUser = cache(async function verifiedUser(): Promise<SessionUser | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return null
  return { id: data.user.id, email: data.user.email ?? null }
})

function supabaseGateway(supabase: Awaited<ReturnType<typeof createClient>>): MemberGateway {
  return {
    currentUserId: async () => (await currentUser())?.id ?? null,
    // The RLS-guarded read. For a non-member the policy admits no row and this
    // returns null, which decideMembership turns into a refusal — the isolation
    // is the database's, not this function's. Columns are named, never '*'.
    orgBySlug: async (slug) => {
      const { data, error } = await supabase
        .from('orgs')
        .select('id, slug, name')
        .eq('slug', slug)
        .maybeSingle()
      if (error) throw error
      return (data as Org) ?? null
    },
  }
}

/** Resolve the Org named by `slug` for the current caller, or refuse. The single
 *  point ADR 0002 rests on: the Org is never taken from the request body, only
 *  from the session plus the slug, and a caller with no Membership is turned
 *  away. Use it as the first line of every Org-scoped page and Server Action.
 *
 *  Cached per request, so the layout's gate and a page that needs the Org's id
 *  share one pair of round-trips instead of repeating them. The cache is a
 *  render-scoped memo, not a session one: a second request re-checks Membership
 *  from scratch, which is what keeps this a gate rather than a stale verdict. */
export const requireMember = cache(async function requireMember(slug: string): Promise<Org> {
  const supabase = await createClient()
  return decideMembership(slug, supabaseGateway(supabase))
})
