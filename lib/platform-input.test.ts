import { describe, expect, it } from 'vitest'
import { MAX_SORT_ORDER, parsePlatformForm } from './platform-input'

/** FormData's shape, minus the file handling the parser never touches. */
function form(fields: Record<string, string>) {
  return { get: (name: string) => (name in fields ? fields[name] : null) }
}

describe('parsePlatformForm', () => {
  it('refuses a blank name', () => {
    expect(parsePlatformForm(form({ name: '' }))).toMatchObject({ ok: false })
  })

  it('refuses a name that is only whitespace', () => {
    expect(parsePlatformForm(form({ name: '   ' }))).toMatchObject({ ok: false })
  })

  it('trims the name it keeps', () => {
    const parsed = parsePlatformForm(form({ name: '  Livinginsider  ', active: 'on' }))
    expect(parsed).toMatchObject({ ok: true, values: { name: 'Livinginsider' } })
  })

  it('treats a missing order as 0 rather than a mistake', () => {
    const parsed = parsePlatformForm(form({ name: 'Facebook' }))
    expect(parsed).toMatchObject({ ok: true, values: { sort_order: 0 } })
  })

  it('accepts an explicit 0', () => {
    const parsed = parsePlatformForm(form({ name: 'Facebook', sort_order: '0' }))
    expect(parsed).toMatchObject({ ok: true, values: { sort_order: 0 } })
  })

  it('refuses a non-numeric order', () => {
    expect(parsePlatformForm(form({ name: 'Facebook', sort_order: 'first' }))).toMatchObject({
      ok: false,
    })
  })

  it('refuses a fractional order', () => {
    expect(parsePlatformForm(form({ name: 'Facebook', sort_order: '1.5' }))).toMatchObject({
      ok: false,
    })
  })

  it('refuses an order out of range at either end', () => {
    expect(parsePlatformForm(form({ name: 'Facebook', sort_order: '-1' }))).toMatchObject({
      ok: false,
    })
    expect(
      parsePlatformForm(form({ name: 'Facebook', sort_order: String(MAX_SORT_ORDER + 1) })),
    ).toMatchObject({ ok: false })
  })

  it('reads a ticked checkbox as active', () => {
    const parsed = parsePlatformForm(form({ name: 'Facebook', active: 'on' }))
    expect(parsed).toMatchObject({ ok: true, values: { active: true } })
  })

  it('reads an absent checkbox as inactive — an unticked box sends nothing', () => {
    const parsed = parsePlatformForm(form({ name: 'Facebook' }))
    expect(parsed).toMatchObject({ ok: true, values: { active: false } })
  })

  it('does not read the string "false" as active', () => {
    const parsed = parsePlatformForm(form({ name: 'Facebook', active: 'false' }))
    expect(parsed).toMatchObject({ ok: true, values: { active: false } })
  })
})
