import { describe, expect, it } from 'vitest'
import {
  composePropertyTitle,
  imageExtension,
  isCreatableStatus,
  isPropertyType,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_TOTAL_BYTES,
  parseBuildingChoice,
  parsePropertyForm,
  validateImages,
  type FormLike,
} from './property-input'

/** A form as the browser sends one: every value a string, absent fields absent. */
function form(fields: Record<string, string>): FormLike {
  return { get: (name) => (name in fields ? fields[name] : null) }
}

const MINIMUM = { property_type: 'condo', price_monthly: '18000' }

function parse(fields: Record<string, string>) {
  return parsePropertyForm(form(fields))
}

describe('parsePropertyForm', () => {
  it('accepts the two required fields on their own', () => {
    const result = parse(MINIMUM)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.values.property_type).toBe('condo')
    expect(result.values.price_monthly).toBe(18000)
  })

  it('falls back to the columns own defaults rather than inventing values', () => {
    const result = parse(MINIMUM)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 0 is what 0001_init.sql defaults these to; null is what the nullable ones
    // hold. A blank field must not become the string "".
    expect(result.values.bedrooms).toBe(0)
    expect(result.values.bathrooms).toBe(0)
    expect(result.values.area_sqm).toBe(0)
    expect(result.values.floor).toBeNull()
    expect(result.values.room_number).toBeNull()
    expect(result.values.description).toBeNull()
    expect(result.values.contact_line).toBeNull()
    expect(result.values.status).toBe('available')
  })

  it('refuses a property type the schema has no enum value for', () => {
    expect(parse({ ...MINIMUM, property_type: 'villa' })).toMatchObject({ ok: false })
    expect(parse({ ...MINIMUM, property_type: '' })).toMatchObject({ ok: false })
  })

  it('refuses a price that is missing, negative or not a number', () => {
    expect(parse({ ...MINIMUM, price_monthly: '' })).toMatchObject({ ok: false })
    expect(parse({ ...MINIMUM, price_monthly: '-1' })).toMatchObject({ ok: false })
    expect(parse({ ...MINIMUM, price_monthly: 'ฟรี' })).toMatchObject({ ok: false })
    // numeric(12,2) cannot hold it, and Postgres' complaint about that is not
    // something the person filling in the form can act on.
    expect(parse({ ...MINIMUM, price_monthly: '99999999999999' })).toMatchObject({ ok: false })
  })

  it('reads a price typed with the separators people type', () => {
    const result = parse({ ...MINIMUM, price_monthly: '18,500.50' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.values.price_monthly).toBe(18500.5)
  })

  it('refuses fractional room counts, which are smallint columns', () => {
    expect(parse({ ...MINIMUM, bedrooms: '1.5' })).toMatchObject({ ok: false })
    expect(parse({ ...MINIMUM, bathrooms: '2.5' })).toMatchObject({ ok: false })
    // Area is not an integer column, so half a square metre is fine.
    const area = parse({ ...MINIMUM, area_sqm: '34.5' })
    expect(area.ok).toBe(true)
    if (area.ok) expect(area.values.area_sqm).toBe(34.5)
  })

  it('keeps a basement floor but refuses an absurd one', () => {
    const basement = parse({ ...MINIMUM, floor: '-1' })
    expect(basement.ok).toBe(true)
    if (basement.ok) expect(basement.values.floor).toBe(-1)
    expect(parse({ ...MINIMUM, floor: '9000' })).toMatchObject({ ok: false })
  })

  it('will not start a Property as rented — that is a Rentals job', () => {
    const rented = parse({ ...MINIMUM, status: 'rented' })
    expect(rented.ok).toBe(false)
    if (!rented.ok) expect(rented.message).toContain('สัญญาเช่า')

    expect(parse({ ...MINIMUM, status: 'deleted' })).toMatchObject({ ok: false })

    const reserved = parse({ ...MINIMUM, status: 'reserved' })
    expect(reserved.ok).toBe(true)
    if (reserved.ok) expect(reserved.values.status).toBe('reserved')
  })

  it('trims the text it keeps', () => {
    const result = parse({ ...MINIMUM, room_number: ' 12/34 ' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.values.room_number).toBe('12/34')
  })
})

describe('parseBuildingChoice', () => {
  const ID = '0c000000-0000-0000-0000-000000000001'

  it('takes the Building that was picked off the list', () => {
    const result = parseBuildingChoice(form({ building_id: ID, building_name: 'ลุมพินี' }))
    expect(result).toMatchObject({ ok: true, values: { buildingId: ID, newName: null } })
  })

  it('takes a typed name when nothing was picked', () => {
    const result = parseBuildingChoice(form({ building_name: '  ศุภาลัย ปาร์ค  ' }))
    expect(result).toMatchObject({ ok: true, values: { buildingId: null, newName: 'ศุภาลัย ปาร์ค' } })
  })

  it('refuses a Property with no โครงการ at all', () => {
    // title is NOT NULL and is composed from the Building's name, so there is
    // nothing to compose from without one.
    expect(parseBuildingChoice(form({}))).toMatchObject({ ok: false })
    expect(parseBuildingChoice(form({ building_name: '   ' }))).toMatchObject({ ok: false })
  })
})

describe('composePropertyTitle', () => {
  it('is the Building name and the room number', () => {
    expect(composePropertyTitle('ลุมพินี พาร์ค พระราม 9', '12/34')).toBe(
      'ลุมพินี พาร์ค พระราม 9 12/34',
    )
  })

  it('is the Building name alone when there is no room number', () => {
    // A house has no unit; the title must still be non-empty, which is what the
    // column's CHECK requires.
    expect(composePropertyTitle('บ้านสุขุมวิท 71', null)).toBe('บ้านสุขุมวิท 71')
    expect(composePropertyTitle('บ้านสุขุมวิท 71', '   ')).toBe('บ้านสุขุมวิท 71')
    expect(composePropertyTitle('  บ้านสุขุมวิท 71  ', undefined)).toBe('บ้านสุขุมวิท 71')
  })
})

describe('isPropertyType / isCreatableStatus', () => {
  it('accept only what the enums hold', () => {
    expect(isPropertyType('townhome')).toBe(true)
    expect(isPropertyType('condominium')).toBe(false)
    expect(isPropertyType(null)).toBe(false)
    expect(isCreatableStatus('available')).toBe(true)
    expect(isCreatableStatus('rented')).toBe(false)
  })
})

describe('validateImages', () => {
  const jpg = (size: number) => ({ size, type: 'image/jpeg' })

  it('accepts nothing at all — photos are optional', () => {
    expect(validateImages([])).toMatchObject({ ok: true })
  })

  it('refuses more files than the form allows, and names the count', () => {
    const tooMany = Array.from({ length: MAX_IMAGES + 1 }, () => jpg(1000))
    const result = validateImages(tooMany)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain(String(MAX_IMAGES))
  })

  it('refuses a file bigger than the bucket would take', () => {
    expect(validateImages([jpg(MAX_IMAGE_BYTES)])).toMatchObject({ ok: true })
    const result = validateImages([jpg(MAX_IMAGE_BYTES + 1)])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('5')
  })

  it('refuses a batch that is under the per-file limit but over the total', () => {
    const each = MAX_IMAGE_BYTES
    const files = Array.from({ length: 5 }, () => jpg(each))
    expect(5 * each).toBeGreaterThan(MAX_IMAGES_TOTAL_BYTES)
    expect(validateImages(files)).toMatchObject({ ok: false })
  })

  it('refuses a type the bucket does not accept', () => {
    expect(validateImages([{ size: 100, type: 'application/pdf' }])).toMatchObject({ ok: false })
    expect(validateImages([{ size: 100, type: '' }])).toMatchObject({ ok: false })
  })
})

describe('imageExtension', () => {
  it('maps the accepted types and nothing else', () => {
    expect(imageExtension('image/jpeg')).toBe('jpg')
    expect(imageExtension('image/png')).toBe('png')
    expect(imageExtension('image/webp')).toBe('webp')
    expect(imageExtension('image/gif')).toBe('gif')
    expect(imageExtension('image/svg+xml')).toBeNull()
  })
})
