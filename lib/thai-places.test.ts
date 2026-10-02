import { describe, expect, it } from 'vitest'
import { codesOf, districtsOf, provinceList, resolveAddress, subdistrictsOf } from './thai-places'

const form = (fields: Record<string, string>) => ({ get: (n: string) => fields[n] ?? null })

describe('the lists', () => {
  it('has every province, and a level only for a real code', () => {
    expect(provinceList()).toHaveLength(77)
    expect(districtsOf('20')?.map((d) => d.th)).toContain('ศรีราชา')
    expect(subdistrictsOf('2007')?.find((s) => s.th === 'ทุ่งสุขลา')?.postcode).toBe('20230')
    expect(districtsOf('99')).toBeNull()
    expect(subdistrictsOf('2099')).toBeNull()
  })
})

describe('resolveAddress', () => {
  it('stores Thai names and takes the postcode from the subdistrict', () => {
    const r = resolveAddress(form({ province_code: '20', district_code: '2007', subdistrict_code: '200703', postcode: '99999' }))
    expect(r).toEqual({ ok: true, values: { province: 'ชลบุรี', district: 'ศรีราชา', subdistrict: 'ทุ่งสุขลา', postcode: '20230' } })
  })

  it('allows blank from any level down', () => {
    expect(resolveAddress(form({}))).toEqual({ ok: true, values: { province: '', district: '', subdistrict: '', postcode: '' } })
    expect(resolveAddress(form({ province_code: '20' }))).toMatchObject({ ok: true, values: { province: 'ชลบุรี', district: '' } })
  })

  it('refuses a level below a blank one, or outside the one above', () => {
    expect(resolveAddress(form({ district_code: '2007' }))).toMatchObject({ ok: false })
    expect(resolveAddress(form({ province_code: '20', subdistrict_code: '200703' }))).toMatchObject({ ok: false })
    // Phra Nakhon is in Bangkok, not Chon Buri.
    expect(resolveAddress(form({ province_code: '20', district_code: '1001' }))).toMatchObject({ ok: false })
    expect(resolveAddress(form({ province_code: '20', district_code: '2007', subdistrict_code: '100101' }))).toMatchObject({ ok: false })
    expect(resolveAddress(form({ province_code: 'x' }))).toMatchObject({ ok: false })
  })
})

describe('codesOf', () => {
  it('finds the codes of a stored address, and stops at a name not in the list', () => {
    expect(codesOf({ province: 'ชลบุรี', district: 'ศรีราชา', subdistrict: 'ทุ่งสุขลา' })).toEqual({ province: '20', district: '2007', subdistrict: '200703' })
    expect(codesOf({ province: 'ชลบุรี', district: 'แหลมฉบัง', subdistrict: '' })).toEqual({ province: '20', district: '', subdistrict: '' })
  })
})
