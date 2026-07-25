import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase-middleware'

// Next 16 renamed the middleware convention to "proxy"; the behaviour is the
// same edge function. It refreshes the Supabase session on every matched request
// and bounces a signed-out caller to /login. Membership is not decided here —
// that is requireMember's job, per Org, on the server (ADR 0002).
export function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // Everything except Next's internals and static assets. The asset lines keep
  // the token refresh off requests that never carry a session.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
