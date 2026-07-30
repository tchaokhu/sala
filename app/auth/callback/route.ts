import { NextResponse, type NextRequest } from 'next/server'
import { isAuthPKCECodeVerifierMissingError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { safeNext, signInAgain } from '@/lib/auth-redirect'

// Where a sign-in link started from this browser lands. It carries a one-time
// code; exchanging it sets the session cookies (via the server client's setAll),
// and only then is the person signed in. On success they go to `next` — the page
// the middleware bounced them off — or to the root, which routes them to their
// Org.
//
// Links that were not started by this browser — an invite, anything opened on a
// different device — have no PKCE verifier to exchange against and go through
// /auth/confirm instead.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(origin + next)

    // PKCE stores the verifier that completes the exchange in a cookie belonging
    // to the browser that asked for the link. Arriving without it means the link
    // was opened somewhere else — the phone, another browser — which is not an
    // expired link and does not have the same answer. auth-js gives this its own
    // error type, so we do not have to guess from a message.
    if (isAuthPKCECodeVerifierMissingError(error)) {
      return NextResponse.redirect(origin + signInAgain('device', next))
    }
  }

  // No code, or an expired/replayed link. Send them back to sign in rather than
  // into an app they are not authenticated for.
  return NextResponse.redirect(origin + signInAgain('expired', next))
}
