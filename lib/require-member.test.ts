import { describe, it, expect } from 'vitest'
import { requireMember, type MemberGateway, type Org } from './require-member'

const ORG: Org = { id: '11111111-1111-1111-1111-111111111111', slug: 'cozy-keys', name: 'Cozy Keys' }
const USER = '22222222-2222-2222-2222-222222222222'

/** A gateway that answers with fixed values, so a test can say exactly who is
 *  logged in and which Org the RLS-guarded read would return. */
function gateway(over: Partial<MemberGateway> = {}): MemberGateway {
  return {
    currentUserId: async () => USER,
    orgBySlug: async () => ORG,
    ...over,
  }
}

describe('requireMember', () => {
  it('returns the Org when the caller is a member', async () => {
    expect(await requireMember('cozy-keys', gateway())).toEqual(ORG)
  })

  // The point of the whole gate: an authenticated caller who is not a member of
  // the Org they asked for is refused, not handed a null to trip over later.
  // The RLS-guarded read returns nothing for them, and that nothing must throw.
  it('refuses when the caller is not a member', async () => {
    const g = gateway({ orgBySlug: async () => null })
    await expect(requireMember('other-agency', g)).rejects.toThrow()
  })

  // No session, no query. An anonymous caller is refused before the Org read
  // runs at all — there is no user to be a member, so there is nothing to look
  // up, and we do not go to the database as nobody.
  it('refuses an unauthenticated caller without reading any Org', async () => {
    let read = false
    const g = gateway({
      currentUserId: async () => null,
      orgBySlug: async () => { read = true; return ORG },
    })
    await expect(requireMember('cozy-keys', g)).rejects.toThrow()
    expect(read).toBe(false)
  })
})
