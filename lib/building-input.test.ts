import { describe, expect, it } from 'vitest'
import { parseBuildingForm } from './building-input'

function form(fields: Record<string, string>) {
  return { get: (name: string) => (name in fields ? fields[name] : null) }
}

describe('parseBuildingForm', () => {
  it('needs a name and nothing else', () => {
    const result = parseBuildingForm(form({ name: 'ลุมพินี พาร์ค พระราม 9' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.values.name).toBe('ลุมพินี พาร์ค พระราม 9')
    expect(result.values.name_en).toBeNull()
    expect(result.values.google_map_url).toBeNull()
    // NOT NULL with no default in the schema, so blank is '' rather than null.
    expect(result.values.district).toBe('')
    expect(result.values.province).toBe('')
  })

  it('refuses a nameless โครงการ', () => {
    expect(parseBuildingForm(form({}))).toMatchObject({ ok: false })
    expect(parseBuildingForm(form({ name: '   ' }))).toMatchObject({ ok: false })
  })

  it('keeps a Google Maps link', () => {
    const url = 'https://maps.app.goo.gl/aBcD1234'
    const result = parseBuildingForm(form({ name: 'ลุมพินี', google_map_url: url }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.values.google_map_url).toBe(url)
  })

  it('refuses a link that is not a Google map, and says where to get one', () => {
    // The stored value is followed by the server and later becomes an iframe
    // src, so this is a fence rather than tidiness.
    const result = parseBuildingForm(form({ name: 'ลุมพินี', google_map_url: 'https://evil.test/x' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('Google Maps')

    expect(
      parseBuildingForm(form({ name: 'ลุมพินี', google_map_url: 'javascript:alert(1)' })),
    ).toMatchObject({ ok: false })
  })
})
