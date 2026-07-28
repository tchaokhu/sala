import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor } from './cursor'

const KEY = { createdAt: '2026-07-28T10:15:00.000Z', id: '0a000000-0000-0000-0000-0000000000a1' }

describe('cursor', () => {
  it('round-trips a key', () => {
    expect(decodeCursor(encodeCursor(KEY))).toEqual(KEY)
  })

  // It travels in a query string. A `+` decoded as a space, or an `=` needing
  // escaping, turns into a page that silently starts from the beginning.
  it('encodes URL-safely', () => {
    expect(encodeCursor(KEY)).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(encodeURIComponent(encodeCursor(KEY))).toBe(encodeCursor(KEY))
  })

  // A cursor arrives from the address bar, so it is attacker-controlled. Every
  // rejection is null — the caller shows page one rather than throwing a 500 at
  // someone who mistyped a URL.
  it('refuses anything it did not write', () => {
    expect(decodeCursor('')).toBeNull()
    expect(decodeCursor('not-base64!!')).toBeNull()
    expect(decodeCursor(Buffer.from('nonsense').toString('base64url'))).toBeNull()
    expect(decodeCursor(Buffer.from('2026-07-28T10:15:00.000Z').toString('base64url'))).toBeNull()
  })

  it('refuses a well-formed cursor carrying a bad key', () => {
    // Right shape, wrong parts: not a uuid, and not a timestamp.
    expect(decodeCursor(Buffer.from('2026-07-28T10:15:00.000Z|not-a-uuid').toString('base64url')))
      .toBeNull()
    expect(decodeCursor(Buffer.from(`yesterday|${KEY.id}`).toString('base64url'))).toBeNull()
  })

  // The id half is what keeps paging correct when a batch import gives every
  // row the same created_at, so a cursor without it is not a cursor.
  it('refuses a cursor missing the tie-break', () => {
    expect(decodeCursor(Buffer.from(KEY.createdAt).toString('base64url'))).toBeNull()
    expect(decodeCursor(Buffer.from(`${KEY.createdAt}|`).toString('base64url'))).toBeNull()
  })
})
