import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { emailLinkType, safeNext, signInAgain } from '@/lib/auth-redirect'

// The other way in: a link the recipient's browser did not ask for.
//
// /auth/callback completes the PKCE flow, which only works in the browser that
// requested the link — it holds the code verifier. An invite (ADR 0006) is sent
// by an operator, so there is no such browser, and the same is true of any link
// a person opens on their phone after requesting it on a laptop. Those carry a
// `token_hash` that GoTrue verifies server-side with no verifier involved, which
// is what this route is for.
//
// `type` is narrowed against a fixed list rather than cast: it decides which
// flow verifyOtp runs, and it arrives in a URL.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = emailLinkType(searchParams.get('type'))
  const next = safeNext(searchParams.get('next'))

  if (tokenHash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(origin + next)
  }

  // A used or expired link, or one whose template does not send `token_hash`.
  // Either way the answer is the same: ask for a fresh one from here.
  return NextResponse.redirect(origin + signInAgain('expired', next))
}
