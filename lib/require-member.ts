export interface Org {
  id: string
  slug: string
  name: string
}

/** The two things requireMember needs from the outside world, and nothing more:
 *  who is logged in, and the Org a slug resolves to *for that caller*. The
 *  production implementation wires both to a Supabase server client, where
 *  `orgBySlug` is an RLS-guarded read that returns nothing for a non-member. A
 *  test supplies a fake so the decision below can be exercised without a
 *  database. See docs/adr/0002-writes-through-server-actions.md. */
export interface MemberGateway {
  currentUserId(): Promise<string | null>
  orgBySlug(slug: string): Promise<Org | null>
}

/** Refusal is deliberately one error, not two. A caller who is not a member and
 *  a slug that does not exist are indistinguishable from the outside — telling
 *  them apart would confirm to an outsider which Orgs are real. Callers map this
 *  to a 404, never a 403. */
export class NotAMemberError extends Error {
  constructor() {
    super('not a member of this org')
    this.name = 'NotAMemberError'
  }
}

/** No session at all. Distinct from NotAMemberError because the caller's
 *  response differs — send them to sign in (a 401), do not pretend the Org is
 *  missing. Which Orgs exist is still not revealed: an anonymous caller learns
 *  nothing about membership either way. */
export class NotAuthenticatedError extends Error {
  constructor() {
    super('not authenticated')
    this.name = 'NotAuthenticatedError'
  }
}

export async function requireMember(slug: string, gateway: MemberGateway): Promise<Org> {
  const userId = await gateway.currentUserId()
  if (!userId) throw new NotAuthenticatedError()
  const org = await gateway.orgBySlug(slug)
  if (!org) throw new NotAMemberError()
  return org
}
