import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// Where the magic link lands. The link carries a one-time code; exchanging it
// sets the session cookies (via the server client's setAll), and only then is
// the person signed in. On success they go to `next` — the page the middleware
// bounced them off — or to the root, which routes them to their Org.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(origin + next)
  }

  // No code, or an expired/replayed link. Send them back to sign in rather than
  // into an app they are not authenticated for.
  return NextResponse.redirect(origin + '/login?error=link')
}

/** Only ever redirect to a path on this origin. A `next` of `//evil.com` or
 *  `https://evil.com` would otherwise turn the callback into an open redirect. */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/'
  return next
}
