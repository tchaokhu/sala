import { describe, expect, it } from 'vitest'
import { isSuperadminId, parseSuperadminIds } from './superadmin'

const A = '937af8eb-e0e8-4be3-9756-b7eb4c980f88'
const B = 'aa000000-0000-0000-0000-0000000000a1'

describe('parseSuperadminIds', () => {
  it('is empty when the variable is unset', () => {
    expect(parseSuperadminIds(undefined).size).toBe(0)
  })

  it('is empty for a blank string', () => {
    expect(parseSuperadminIds('   ').size).toBe(0)
  })

  it('reads one id', () => {
    expect([...parseSuperadminIds(A)]).toEqual([A])
  })

  it('reads several, separated by commas, spaces or newlines', () => {
    expect(parseSuperadminIds(`${A}, ${B}`)).toEqual(new Set([A, B]))
    expect(parseSuperadminIds(`${A} ${B}`)).toEqual(new Set([A, B]))
    expect(parseSuperadminIds(`${A}\n${B}`)).toEqual(new Set([A, B]))
  })

  it('tolerates a trailing comma', () => {
    expect(parseSuperadminIds(`${A},`)).toEqual(new Set([A]))
  })

  // The failure this guards against is an operator pasting an email address, or
  // a shell leaving quotes on the value. Either would sit in the set forever,
  // matching nothing, and look configured.
  it('drops anything that is not a uuid', () => {
    expect(parseSuperadminIds('nrnutthanapon@gmail.com').size).toBe(0)
    expect(parseSuperadminIds(`"${A}"`).size).toBe(0)
    expect(parseSuperadminIds('*').size).toBe(0)
    expect(parseSuperadminIds(`${A}-extra`).size).toBe(0)
  })

  it('keeps the good ids when one entry is junk', () => {
    expect(parseSuperadminIds(`${A}, not-a-uuid`)).toEqual(new Set([A]))
  })

  it('normalises case, because Postgres prints uuids lowercase either way', () => {
    expect(parseSuperadminIds(A.toUpperCase())).toEqual(new Set([A]))
  })
})

describe('isSuperadminId', () => {
  const allowed = parseSuperadminIds(A)

  it('admits a listed id', () => {
    expect(isSuperadminId(A, allowed)).toBe(true)
  })

  it('admits it whatever case it arrives in', () => {
    expect(isSuperadminId(A.toUpperCase(), allowed)).toBe(true)
  })

  it('refuses an unlisted id', () => {
    expect(isSuperadminId(B, allowed)).toBe(false)
  })

  // A failed session lookup returns null, and it must not be mistaken for a
  // match against an empty allowlist.
  it('refuses null and undefined', () => {
    expect(isSuperadminId(null, allowed)).toBe(false)
    expect(isSuperadminId(undefined, allowed)).toBe(false)
  })

  it('refuses everyone when nothing is configured', () => {
    const none = parseSuperadminIds(undefined)
    expect(isSuperadminId(A, none)).toBe(false)
    expect(isSuperadminId(B, none)).toBe(false)
  })
})
