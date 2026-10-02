import { describe, expect, it } from 'vitest'
import { parseOwnerForm } from './owner-input'

const form = (fields: Record<string, string>) => ({ get: (n: string) => fields[n] ?? null })

describe('parseOwnerForm', () => {
  it('needs only a name; a blank phone is stored as an empty string', () => {
    const r = parseOwnerForm(form({ name: 'สมชาย ใจดี' }))
    expect(r).toMatchObject({ ok: true, values: { name: 'สมชาย ใจดี', phone: '', email: null } })
  })

  it('refuses a nameless Owner', () => {
    expect(parseOwnerForm(form({ phone: '081 234 5678' }))).toMatchObject({ ok: false })
  })

  it('still checks a phone that was given', () => {
    expect(parseOwnerForm(form({ name: 'A', phone: '081 234 5678' }))).toMatchObject({ ok: true, values: { phone: '081 234 5678' } })
    expect(parseOwnerForm(form({ name: 'A', phone: 'call me' }))).toMatchObject({ ok: false })
  })
})
