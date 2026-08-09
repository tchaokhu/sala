import { describe, expect, it } from 'vitest'
import { emailLinkType, safeNext, signInAgain } from './auth-redirect'

describe('safeNext', () => {
  it('keeps a path on this origin', () => {
    expect(safeNext('/o/cozy-keys')).toBe('/o/cozy-keys')
    expect(safeNext('/o/cozy-keys/properties?status=available')).toBe(
      '/o/cozy-keys/properties?status=available',
    )
  })

  it('falls back to the root when there is nothing to return to', () => {
    expect(safeNext(null)).toBe('/')
    expect(safeNext(undefined)).toBe('/')
    expect(safeNext('')).toBe('/')
  })

  // The whole reason this function exists. A callback that honoured any of
  // these would send somebody, mid-sign-in, to a page of someone else's
  // choosing — with the link they clicked looking like ours.
  it('refuses an absolute URL', () => {
    expect(safeNext('https://evil.com')).toBe('/')
    expect(safeNext('http://evil.com/path')).toBe('/')
  })

  it('refuses a protocol-relative URL', () => {
    expect(safeNext('//evil.com')).toBe('/')
    expect(safeNext('//evil.com/o/cozy-keys')).toBe('/')
  })

  it('refuses the backslash spelling of one', () => {
    expect(safeNext('/\\evil.com')).toBe('/')
  })

  it('refuses a scheme that is not http', () => {
    expect(safeNext('javascript:alert(1)')).toBe('/')
    expect(safeNext('data:text/html,x')).toBe('/')
  })

  it('refuses a bare path with no leading slash', () => {
    expect(safeNext('o/cozy-keys')).toBe('/')
    expect(safeNext('evil.com')).toBe('/')
  })
})

describe('signInAgain', () => {
  it('names the reason', () => {
    expect(signInAgain('expired', '/')).toBe('/login?error=expired')
    expect(signInAgain('device', '/')).toBe('/login?error=device')
    expect(signInAgain('not-invited', '/')).toBe('/login?error=not-invited')
  })

  it('carries the destination, so a second link still lands there', () => {
    expect(signInAgain('expired', '/o/cozy-keys')).toBe(
      '/login?error=expired&next=%2Fo%2Fcozy-keys',
    )
  })

  it('omits the destination when it is the root', () => {
    expect(signInAgain('expired', '/')).not.toContain('next=')
  })

  // The error path must not be a way around the guard on the success path.
  it('sanitises the destination it carries', () => {
    expect(signInAgain('expired', '//evil.com')).toBe('/login?error=expired')
    expect(signInAgain('device', 'https://evil.com')).toBe('/login?error=device')
  })
})

describe('emailLinkType', () => {
  it('admits the types this app completes', () => {
    expect(emailLinkType('invite')).toBe('invite')
    expect(emailLinkType('magiclink')).toBe('magiclink')
    expect(emailLinkType('recovery')).toBe('recovery')
    expect(emailLinkType('email_change')).toBe('email_change')
    expect(emailLinkType('signup')).toBe('signup')
  })

  it('refuses anything else, so the query cannot choose the flow', () => {
    expect(emailLinkType('sms')).toBe(null)
    expect(emailLinkType('')).toBe(null)
    expect(emailLinkType(null)).toBe(null)
    expect(emailLinkType(undefined)).toBe(null)
    expect(emailLinkType('INVITE')).toBe(null)
  })
})
