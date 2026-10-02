import { describe, expect, it } from 'vitest'
import {
  composePropertyTitle,
  imageExtension,
  isCreatableStatus,
  isPropertyType,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_TOTAL_BYTES,
  orderImages,
  parseBuildingChoice,
  parsePropertyEditForm,
  parsePropertyForm,
  validateImages,
  validatePropertyImageEdit,
  type FormLike,
} from './property-input'
import type { PropertyStatus } from './properties'

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
    expect(parse({ ...MINIMUM, price_monthly: 'free' })).toMatchObject({ ok: false })
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
    if (!rented.ok) expect(rented.message).toContain('Rental')

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

describe('parsePropertyEditForm', () => {
  function parseEdit(
    fields: Record<string, string>,
    currentStatus: PropertyStatus,
    hasActiveRental = currentStatus === 'rented',
  ) {
    return parsePropertyEditForm(form(fields), currentStatus, hasActiveRental)
  }

  it('reads the same fields create does', () => {
    // Both sides go through parsePropertyFields, so this is a check that edit is
    // built on it rather than a second, drifting copy of the same rules.
    const result = parseEdit({ ...MINIMUM, room_number: ' 12/34 ', bedrooms: '2' }, 'available')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.values.room_number).toBe('12/34')
    expect(result.values.bedrooms).toBe(2)
  })

  it('rejects a bad field even when the status lock would decide the status', () => {
    // The `rented` shortcut returns early; it must not return early past the
    // field parsing, or an edit of a rented row could write a negative price.
    expect(parseEdit({ ...MINIMUM, price_monthly: '-1' }, 'rented')).toMatchObject({ ok: false })
  })

  it('moves a Property between available and reserved in both directions', () => {
    const reserving = parseEdit({ ...MINIMUM, status: 'reserved' }, 'available')
    expect(reserving.ok).toBe(true)
    if (reserving.ok) expect(reserving.values.status).toBe('reserved')

    const releasing = parseEdit({ ...MINIMUM, status: 'available' }, 'reserved')
    expect(releasing.ok).toBe(true)
    if (releasing.ok) expect(releasing.values.status).toBe('available')
  })

  it('refuses a posted rented on a Property that is not rented', () => {
    // The form omits the field entirely in this case, so anything arriving here
    // is hand-built. No Rental exists behind it, and the list would show
    // "Rented" beside an empty tenant column (ADR 0009).
    const result = parseEdit({ ...MINIMUM, status: 'rented' }, 'available')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('Rental')

    expect(parseEdit({ ...MINIMUM, status: 'rented' }, 'reserved')).toMatchObject({ ok: false })
  })

  it('keeps a Property with an active Rental where it is, whatever was posted', () => {
    // The lock, and the reason the UI hiding the <select> is not the lock:
    // ending or deleting the Rental is what frees the room (ADR 0009, amended),
    // so nothing this form receives may claim the tenancy is over.
    for (const posted of ['available', 'reserved', 'rented', 'deleted', '']) {
      const result = parseEdit({ ...MINIMUM, status: posted }, 'rented')
      expect(result.ok, `posted status ${JSON.stringify(posted)}`).toBe(true)
      if (result.ok) expect(result.values.status).toBe('rented')
    }
    // And with no status field at all, as the real form posts it.
    const absent = parseEdit(MINIMUM, 'rented')
    expect(absent.ok).toBe(true)
    if (absent.ok) expect(absent.values.status).toBe('rented')
  })

  it('lets a stale rented Property — no active Rental — go back to Available', () => {
    const freed = parseEdit({ ...MINIMUM, status: 'available' }, 'rented', false)
    expect(freed).toMatchObject({ ok: true, values: { status: 'available' } })
    expect(parseEdit({ ...MINIMUM, status: 'reserved' }, 'rented', false)).toMatchObject({ ok: true, values: { status: 'reserved' } })
    // Untouched, it stays as it is; posted `rented` is still refused.
    expect(parseEdit(MINIMUM, 'rented', false)).toMatchObject({ ok: true, values: { status: 'rented' } })
    expect(parseEdit({ ...MINIMUM, status: 'rented' }, 'rented', false)).toMatchObject({ ok: false })
  })

  it('locks on the active Rental, not on the status column', () => {
    // Inconsistent data (an active Rental behind an `available` row) is left
    // for the Rental flow to put right, not moved by an edit.
    expect(parseEdit({ ...MINIMUM, status: 'reserved' }, 'available', true)).toMatchObject({ ok: true, values: { status: 'available' } })
  })

  it('leaves the status alone when the form says nothing about it', () => {
    // Create defaults a blank to 'available'. On edit that would quietly demote a
    // reserved Property the moment somebody saved a price correction.
    for (const currentStatus of ['available', 'reserved'] as const) {
      const absent = parseEdit(MINIMUM, currentStatus)
      expect(absent.ok).toBe(true)
      if (absent.ok) expect(absent.values.status).toBe(currentStatus)

      const blank = parseEdit({ ...MINIMUM, status: '' }, currentStatus)
      expect(blank.ok).toBe(true)
      if (blank.ok) expect(blank.values.status).toBe(currentStatus)
    }
  })

  it('refuses a status the enum has no value for', () => {
    expect(parseEdit({ ...MINIMUM, status: 'deleted' }, 'available')).toMatchObject({ ok: false })
    // The label the UI shows, rather than the enum value behind it.
    expect(parseEdit({ ...MINIMUM, status: 'Available' }, 'reserved')).toMatchObject({ ok: false })
  })
})

describe('validatePropertyImageEdit', () => {
  const jpg = (size: number) => ({ size, type: 'image/jpeg' })
  const files = (n: number, size = 1000) => Array.from({ length: n }, () => jpg(size))

  it('counts kept photos and new files against the same limit', () => {
    expect(validatePropertyImageEdit(MAX_IMAGES - 3, files(3))).toMatchObject({ ok: true })
    const over = validatePropertyImageEdit(MAX_IMAGES - 2, files(3))
    expect(over.ok).toBe(false)
    // The message has to say how many there would be, not just the limit —
    // otherwise "8 max" beside a picker showing 3 reads as a bug.
    if (!over.ok) {
      expect(over.message).toContain(String(MAX_IMAGES))
      expect(over.message).toContain(String(MAX_IMAGES + 1))
    }
  })

  it('lets a Property already at the limit be saved with no new photos', () => {
    // Editing a price on a Property with a full gallery must not be blocked by
    // photos nobody touched.
    expect(validatePropertyImageEdit(MAX_IMAGES, [])).toMatchObject({ ok: true })
    expect(validatePropertyImageEdit(MAX_IMAGES, files(1))).toMatchObject({ ok: false })
  })

  it('counts only what survives the removals', () => {
    // The action intersects removed_images with the row's own images first, so
    // keptCount is already net of them: a full gallery with three removed has
    // room for three more.
    expect(validatePropertyImageEdit(MAX_IMAGES - 3, files(3))).toMatchObject({ ok: true })
  })

  it('still applies the per-file rules to the arriving files', () => {
    expect(validatePropertyImageEdit(0, [{ size: 100, type: 'application/pdf' }])).toMatchObject({
      ok: false,
    })
    expect(validatePropertyImageEdit(0, [jpg(MAX_IMAGE_BYTES + 1)])).toMatchObject({ ok: false })
    expect(validatePropertyImageEdit(0, files(MAX_IMAGES + 1))).toMatchObject({ ok: false })
  })

  it('measures the request-body cap against the new bytes only', () => {
    // MAX_IMAGES_TOTAL_BYTES bounds one request body (ADR 0007). Kept photos are
    // not re-transferred, so four 5 MB uploads alongside four kept photos is
    // exactly at both caps and must pass.
    const four = files(4, MAX_IMAGE_BYTES)
    expect(4 * MAX_IMAGE_BYTES).toBe(MAX_IMAGES_TOTAL_BYTES)
    expect(validatePropertyImageEdit(MAX_IMAGES - 4, four)).toMatchObject({ ok: true })
    expect(validatePropertyImageEdit(0, files(5, MAX_IMAGE_BYTES))).toMatchObject({ ok: false })
  })

  it('accepts an edit that touches no photos at all', () => {
    expect(validatePropertyImageEdit(0, [])).toMatchObject({ ok: true })
    expect(validatePropertyImageEdit(3, [])).toMatchObject({ ok: true })
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

  it('refuses a Property with no Building at all', () => {
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

describe('orderImages', () => {
  const kept = ['o/p/a.jpg', 'o/p/b.jpg']
  const uploaded = ['o/p/x.jpg', 'o/p/y.jpg']

  it('puts the photos in the order shown, new among kept', () => {
    expect(orderImages(['new:1', 'path:o/p/b.jpg', 'new:0', 'path:o/p/a.jpg'], kept, uploaded)).toEqual({
      ok: true,
      values: ['o/p/y.jpg', 'o/p/b.jpg', 'o/p/x.jpg', 'o/p/a.jpg'],
    })
  })

  it('keeps the old order for anything the order leaves out', () => {
    expect(orderImages([], kept, uploaded)).toEqual({ ok: true, values: [...kept, ...uploaded] })
    expect(orderImages(['new:0'], kept, uploaded)).toEqual({ ok: true, values: ['o/p/x.jpg', ...kept, 'o/p/y.jpg'] })
  })

  it('refuses a path not kept, an upload that is not there, or a repeat', () => {
    expect(orderImages(['path:o/other/z.jpg'], kept, uploaded)).toMatchObject({ ok: false })
    expect(orderImages(['new:5'], kept, uploaded)).toMatchObject({ ok: false })
    expect(orderImages(['path:o/p/a.jpg', 'path:o/p/a.jpg'], kept, uploaded)).toMatchObject({ ok: false })
  })
})
