// Session refresh for the Edge middleware.
//
// @supabase/ssr keeps the session in cookies that expire, and a Server Component
// cannot write cookies — this is where the refresh actually happens. On every
// matched request it reads the session's claims, which rotates the tokens, and writes the
// refreshed cookies onto both the request (so the same request sees them) and
// the response (so the browser stores them). supabase-server.ts leans on this:
// its cookie writes are swallowed precisely because this runs first.
//
// It does not decide membership. That is resolved per-Org, server-side, by
// requireMember (ADR 0002). All this does is a coarse "is anyone signed in?"
// gate, sending an anonymous caller to /login before a page bothers to render.

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** Missing configuration fails here first, on the very first request, and the
 *  Supabase client's own message points at the dashboard rather than at what is
 *  actually absent: the file. Say which name is missing and where it goes. */
function env(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.local.example to .env.local and fill in the ` +
      `Project URL and anon key from Supabase → Settings → API, then restart the ` +
      `dev server — Next reads .env.local at boot.`,
    )
  }
  return value
}

// Paths a signed-out visitor may reach: the sign-in page and the magic-link
// callback that establishes the session in the first place.
const PUBLIC_PREFIXES = ['/login', '/auth']

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    env('NEXT_PUBLIC_SUPABASE_URL'),
    env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value)
          response = NextResponse.next({ request })
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options)
        },
      },
    },
  )

  // Do not run code between createServerClient and getClaims: getClaims is what
  // refreshes the token, and a stray await here can desync the cookies. It
  // verifies the JWT locally against the project's signing key instead of asking
  // the auth server, which was a round-trip in front of every request (ADR 0015).
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims?.sub ? data.claims : null

  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Remember where they were headed, so the callback can return them there.
    url.searchParams.set('next', pathname + request.nextUrl.search)
    return NextResponse.redirect(url)
  }

  return response
}
