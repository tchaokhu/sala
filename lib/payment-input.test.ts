import { describe, expect, it } from 'vitest'
import { parseCorrectForm, parseSettleForm } from './payment-input'

const form = (fields: Record<string, string>) => ({ get: (name: string) => fields[name] ?? null })

const TODAY = '2026-10-10'
const OPEN = { amount: 8000, settled_amount: null, note: null }
const PART = { amount: 8000, settled_amount: 5000, note: 'first half' }
const FIELDS = { amount: '3,000', settled_date: '2026-10-05', method: 'transfer', note: '' }

describe('parseSettleForm', () => {
  it('adds an instalment to the running total', () => {
    expect(parseSettleForm(form(FIELDS), PART, TODAY)).toEqual({
      ok: true,
      values: { settled_amount: 8000, settled_date: '2026-10-05', method: 'transfer', note: 'first half' },
    })
  })

  it('accepts a date before the due date', () => {
    expect(parseSettleForm(form({ ...FIELDS, settled_date: '2025-01-01' }), OPEN, TODAY).ok).toBe(true)
  })

  it('refuses more than is still owed', () => {
    const r = parseSettleForm(form({ ...FIELDS, amount: '3000.01' }), PART, TODAY)
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining('฿3,000') })
  })

  it('refuses zero and a blank amount', () => {
    expect(parseSettleForm(form({ ...FIELDS, amount: '0' }), OPEN, TODAY).ok).toBe(false)
    expect(parseSettleForm(form({ ...FIELDS, amount: '' }), OPEN, TODAY).ok).toBe(false)
  })

  it('refuses a date after today', () => {
    expect(parseSettleForm(form({ ...FIELDS, settled_date: '2026-10-11' }), OPEN, TODAY).ok).toBe(false)
  })

  it('refuses a method outside the enum', () => {
    expect(parseSettleForm(form({ ...FIELDS, method: 'cheque' }), OPEN, TODAY).ok).toBe(false)
    expect(parseSettleForm(form({ ...FIELDS, method: '' }), OPEN, TODAY).ok).toBe(false)
  })

  it('refuses a note over 500 characters', () => {
    expect(parseSettleForm(form({ ...FIELDS, note: 'x'.repeat(501) }), OPEN, TODAY).ok).toBe(false)
    expect(parseSettleForm(form({ ...FIELDS, note: 'x'.repeat(500) }), OPEN, TODAY).ok).toBe(true)
  })

  it('refuses a Payment already settled in full', () => {
    expect(parseSettleForm(form(FIELDS), { ...OPEN, settled_amount: 8000 }, TODAY).ok).toBe(false)
  })
})

describe('parseCorrectForm', () => {
  it('replaces the total rather than adding to it, and a blank note clears', () => {
    expect(parseCorrectForm(form({ ...FIELDS, amount: '4000', method: 'cash' }), PART, TODAY)).toEqual({
      ok: true,
      values: { settled_amount: 4000, settled_date: '2026-10-05', method: 'cash', note: null },
    })
  })

  it('accepts the full amount and refuses more', () => {
    expect(parseCorrectForm(form({ ...FIELDS, amount: '8000' }), PART, TODAY).ok).toBe(true)
    expect(parseCorrectForm(form({ ...FIELDS, amount: '8000.01' }), PART, TODAY).ok).toBe(false)
  })

  it('sends zero to Clear instead', () => {
    const r = parseCorrectForm(form({ ...FIELDS, amount: '0' }), PART, TODAY)
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining('Clear this settlement') })
  })

  it('refuses a future date and an unknown method', () => {
    expect(parseCorrectForm(form({ ...FIELDS, settled_date: '2026-10-11' }), PART, TODAY).ok).toBe(false)
    expect(parseCorrectForm(form({ ...FIELDS, method: 'card' }), PART, TODAY).ok).toBe(false)
  })
})
