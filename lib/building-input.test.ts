import { describe, expect, it } from 'vitest'
import { MAX_LIST_ITEM, MAX_LIST_ITEMS, parseBuildingForm, parseList } from './building-input'

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
  })

  it('refuses a nameless Building', () => {
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

describe('parseList', () => {
  it('reads one item per line, keeping the separators real items contain', () => {
    expect(parseList('Lobby + Lounge\nCo-working / พื้นที่นั่งทำงาน\r\nสระว่ายน้ำ', 'Facilities')).toEqual({
      ok: true,
      values: ['Lobby + Lounge', 'Co-working / พื้นที่นั่งทำงาน', 'สระว่ายน้ำ'],
    })
  })

  it('drops blank lines, tidies spaces, and keeps the first spelling of a repeat', () => {
    expect(parseList('  Fitness  \n\n   \nfitness\nSky   lounge', 'Facilities')).toEqual({
      ok: true,
      values: ['Fitness', 'Sky lounge'],
    })
  })

  it('treats a missing field as an empty list', () => {
    expect(parseList(null, 'Nearby')).toEqual({ ok: true, values: [] })
  })

  it('refuses a line that is too long, naming the list and the limit', () => {
    const result = parseList('x'.repeat(MAX_LIST_ITEM + 1), 'Nearby')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain(`Nearby line under ${MAX_LIST_ITEM}`)
  })

  it('refuses more items than the cap, and accepts exactly the cap', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `Item ${i}`).join('\n')
    expect(parseList(many(MAX_LIST_ITEMS), 'Facilities')).toMatchObject({ ok: true })
    expect(parseList(many(MAX_LIST_ITEMS + 1), 'Facilities')).toMatchObject({ ok: false })
  })
})

describe('parseBuildingForm lists', () => {
  it('carries facilities and nearby through to the values', () => {
    const result = parseBuildingForm(form({ name: 'ลุมพินี', facilities: 'Fitness\nSauna', nearby: 'BTS' }))
    expect(result).toMatchObject({ ok: true, values: { facilities: ['Fitness', 'Sauna'], nearby: ['BTS'] } })
  })

  it('stops on a bad list', () => {
    expect(parseBuildingForm(form({ name: 'ลุมพินี', nearby: 'x'.repeat(MAX_LIST_ITEM + 1) }))).toMatchObject({ ok: false })
  })
})
