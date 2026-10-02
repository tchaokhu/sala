// Thailand's provinces, districts and subdistricts, for a Building's address.
// The data is lib/thai-places.json (scripts/build-thai-places.mjs says where it
// comes from); codes are the official ones, names are stored in Thai.
//
// Server only in practice: the JSON is 450 KB, so nothing 'use client' may
// import this. The browser gets one level at a time from app/places/ — the
// provinces as page props, a province's districts and a district's
// subdistricts from the route handlers there — all read from this one file.

import data from './thai-places.json'
import type { Parsed } from './property-input'

type Sub = [code: number, th: string, en: string, postcode: string]
type District = [code: number, th: string, en: string, subs: Sub[]]
type Province = [code: number, th: string, en: string, districts: District[]]

const PROVINCES = data.provinces as Province[]

/** One option in an address picker. */
export interface Place {
  code: string
  th: string
  en: string
  /** Subdistricts only. */
  postcode?: string
}

const place = ([code, th, en]: [number, string, string, ...unknown[]]): Place => ({ code: String(code), th, en })

export function provinceList(): Place[] {
  return PROVINCES.map(place)
}

const findProvince = (code: string) => PROVINCES.find((p) => String(p[0]) === code)
const findDistrict = (code: string) => findProvince(code.slice(0, -2))?.[3].find((d) => String(d[0]) === code)

/** Null for a code that is not a province. */
export function districtsOf(provinceCode: string): Place[] | null {
  return findProvince(provinceCode)?.[3].map(place) ?? null
}

/** Null for a code that is not a district. */
export function subdistrictsOf(districtCode: string): Place[] | null {
  return findDistrict(districtCode)?.[3].map((s) => ({ ...place(s), postcode: s[3] })) ?? null
}

/** Every province and district code — what app/places/ pre-renders. */
export function allCodes(): { province: string; district: string[] }[] {
  return PROVINCES.map((p) => ({ province: String(p[0]), district: p[3].map((d) => String(d[0])) }))
}

/** What a Building stores: Thai names and the postcode, '' where blank. */
export interface Address {
  province: string
  district: string
  subdistrict: string
  postcode: string
}

/**
 * The form posts codes; this turns them into what is stored. Each level may be
 * blank, but not below a blank one, and each must sit inside the one above.
 * The postcode is the subdistrict's own — never anything the form sent.
 */
export function resolveAddress(form: { get(name: string): unknown }): Parsed<Address> {
  const read = (name: string) => {
    const v = form.get(name)
    return typeof v === 'string' ? v.trim() : ''
  }
  const pc = read('province_code')
  const dc = read('district_code')
  const sc = read('subdistrict_code')
  const blank: Address = { province: '', district: '', subdistrict: '', postcode: '' }

  if (!pc) {
    if (dc || sc) return { ok: false, message: 'Choose the province before the district' }
    return { ok: true, values: blank }
  }
  const p = findProvince(pc)
  if (!p) return { ok: false, message: 'Choose the province from the list' }
  if (!dc) {
    if (sc) return { ok: false, message: 'Choose the district before the subdistrict' }
    return { ok: true, values: { ...blank, province: p[1] } }
  }
  const d = p[3].find((x) => String(x[0]) === dc)
  if (!d) return { ok: false, message: `Choose a district in ${p[2]} from the list` }
  if (!sc) return { ok: true, values: { ...blank, province: p[1], district: d[1] } }
  const s = d[3].find((x) => String(x[0]) === sc)
  if (!s) return { ok: false, message: `Choose a subdistrict in ${d[2]} from the list` }
  return { ok: true, values: { province: p[1], district: d[1], subdistrict: s[1], postcode: s[3] } }
}

/**
 * The codes for an address already stored, to open the edit form on it. A name
 * that is not in the list — typed by hand before the pickers existed — gives
 * no code from that level down, and the picker opens blank there.
 */
export function codesOf(stored: { province: string; district: string; subdistrict: string }): {
  province: string
  district: string
  subdistrict: string
} {
  const p = PROVINCES.find((x) => x[1] === stored.province)
  const d = p?.[3].find((x) => x[1] === stored.district)
  const s = d?.[3].find((x) => x[1] === stored.subdistrict)
  return { province: p ? String(p[0]) : '', district: d ? String(d[0]) : '', subdistrict: s ? String(s[0]) : '' }
}

/** Where the edit form's pickers open: the stored address's codes, and the two
 *  lists below its province and district, so nothing is fetched on arrival. */
export interface AddressInitial {
  province: string
  district: string
  subdistrict: string
  districts: Place[] | null
  subdistricts: Place[] | null
}

export function addressInitial(stored: { province: string; district: string; subdistrict: string }): AddressInitial {
  const c = codesOf(stored)
  return {
    ...c,
    districts: c.province ? districtsOf(c.province) : null,
    subdistricts: c.district ? subdistrictsOf(c.district) : null,
  }
}
