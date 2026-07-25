// The server-side Supabase client and the production wiring of requireMember.
//
// This is the half of the membership gate that cannot run in a plain vitest
// process: it reads the session from request cookies and performs the org read
// as the signed-in user, so RLS does the filtering. The decision it feeds —
// return the Org, or refuse — lives in ./require-member, which stays free of any
// Next or Supabase import and is unit-tested there. Once a Supabase project
// exists (ADR 0004) the read path here is exercised for real; until then it
// compiles but is unverified, and the seam is what keeps that honest.
//
// See docs/adr/0002-writes-through-server-actions.md and
// docs/adr/0004-fresh-supabase-project-cozy-keys-etl.md.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
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
export async function createClient() {
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
}

function supabaseGateway(supabase: Awaited<ReturnType<typeof createClient>>): MemberGateway {
  return {
    currentUserId: async () => {
      const { data } = await supabase.auth.getUser()
      return data.user?.id ?? null
    },
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
 *  away. Use it as the first line of every Org-scoped page and Server Action. */
export async function requireMember(slug: string): Promise<Org> {
  const supabase = await createClient()
  return decideMembership(slug, supabaseGateway(supabase))
}
