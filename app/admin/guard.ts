import 'server-only'

import { currentUser } from '@/lib/supabase-server'
import { isSuperadmin, noSuperadminsConfigured } from '@/lib/superadmin'

/** Signed in, but not an operator. Mapped to a 404 rather than a 403 — the same
 *  reasoning NotAMemberError already carries: whether the console exists is not
 *  something the console should confirm to somebody who cannot use it. */
export class NotSuperadminError extends Error {
  constructor() {
    super('not a superadmin')
    this.name = 'NotSuperadminError'
  }
}

export class NotAuthenticatedError extends Error {
  constructor() {
    super('not authenticated')
    this.name = 'NotAuthenticatedError'
  }
}

/** The first line of the console's layout *and* of every Server Action under it.
 *  Both, not either: the layout gate is what gets a person to the page, and a
 *  Server Action is an HTTP endpoint that no layout runs in front of. A check
 *  that only guards the render guards nothing.
 *
 *  Throws rather than calling notFound() so the same function serves both — an
 *  action that redirected to a 404 page would swallow its own failure. Callers
 *  map the two errors; see app/admin/layout.tsx. */
export async function requireSuperadmin() {
  const user = await currentUser()
  if (!user) throw new NotAuthenticatedError()

  if (!isSuperadmin(user.id)) {
    if (noSuperadminsConfigured()) {
      // Never rendered — saying this to the visitor would confirm the page is
      // there. The operator who just deployed reads it in the server log.
      console.warn(
        'SALA_SUPERADMIN_USER_IDS is empty, so /admin refuses everyone. ' +
        'Set it to the operator\'s auth user id and restart.',
      )
    }
    throw new NotSuperadminError()
  }

  return user
}
