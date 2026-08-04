// Everything the add-a-Property form decides, with no I/O in it.
//
// Split out for the same reason lib/require-member.ts is: the judgement — what
// counts as a title, how big a photo may be, which statuses a new Property may
// start in — is the part worth testing, and it cannot be tested at all if it
// only exists inside a Server Action that needs cookies and a database.
//
// It is also the module both sides can import. lib/properties.ts reaches
// next/headers through the server client, so a client component that wanted
// PROPERTY_TYPES from there would drag that into the browser bundle. The runtime
// vocabulary a form needs lives here, where nothing server-only does.

import type { PropertyStatus } from './properties'
import { cleanText } from './validate'

export const PROPERTY_TYPES = ['condo', 'house', 'townhome'] as const
export type PropertyType = (typeof PROPERTY_TYPES)[number]

export function isPropertyType(value: unknown): value is PropertyType {
  return typeof value === 'string' && (PROPERTY_TYPES as readonly string[]).includes(value)
}

/** The user's word for each of them. One Thai word per term, here and only here
 *  (CLAUDE.md) — the table and the form must not drift apart. */
export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  condo: 'คอนโด',
  house: 'บ้าน',
  townhome: 'ทาวน์โฮม',
}

/** `rented` is not one of them. A Property becomes occupied by having an active
 *  Rental (CONTEXT.md), and a row that claims a tenant without one renders as
 *  "มีผู้เช่า" beside an empty tenant column — a lie the list cannot correct. */
export const CREATABLE_STATUSES = ['available', 'reserved'] as const satisfies readonly PropertyStatus[]
export type CreatableStatus = (typeof CREATABLE_STATUSES)[number]

export function isCreatableStatus(value: unknown): value is CreatableStatus {
  return typeof value === 'string' && (CREATABLE_STATUSES as readonly string[]).includes(value)
}

/** The row this form produces, named in the database's own columns so the action
 *  can hand it to `insert` without a second mapping to get wrong.
 *
 *  No `title`: it is composed from the Building's name and the room number by
 *  `composePropertyTitle`, and the Building's name is read from the database
 *  rather than from the form (ADR 0008). No `location`, `district` or
 *  `province` either — those describe where the Building is, and copying them
 *  onto every Property inside it is a second copy to keep in step. */
export interface NewProperty {
  property_type: PropertyType
  price_monthly: number
  bedrooms: number
  bathrooms: number
  area_sqm: number
  floor: number | null
  room_number: string | null
  description: string | null
  contact_line: string | null
  status: CreatableStatus
}

export type Parsed<T> = { ok: true; values: T } | { ok: false; message: string }

/** Only the bit of FormData this needs, so a test can pass a plain object. */
export interface FormLike {
  get(name: string): unknown
}

// Bounds. The money and area ones are the column widths — numeric(12,2) and
// numeric(8,2) — because a value past them is rejected by Postgres with text
// nobody outside this repo can act on. The rest are ordinary sanity.
export const MAX_PRICE = 9_999_999_999.99
export const MAX_AREA = 999_999.99
export const MAX_ROOMS = 99
export const MIN_FLOOR = -10
export const MAX_FLOOR = 200
export const MAX_TITLE = 200
export const MAX_ROOM_NUMBER = 40
export const MAX_DESCRIPTION = 4000

/** Everything on the form except `status`, which is the one field create and
 *  edit disagree about — see `parsePropertyForm` and `parsePropertyEditForm`. */
export type PropertyFields = Omit<NewProperty, 'status'>

/**
 * Read the form, or say what is wrong with it in words the person can act on.
 *
 * Stops at the first problem: a form that reports one fixable thing at a time is
 * better than one that reports five, and every field here is independent, so
 * fixing them in order terminates.
 */
export function parsePropertyForm(form: FormLike): Parsed<NewProperty> {
  const fields = parsePropertyFields(form)
  if (!fields.ok) return fields

  // Absent means the ordinary case rather than a mistake: a Property nobody said
  // anything about is empty, which is also the column's default. Present but
  // unrecognised is refused — including 'rented', which is the one somebody will
  // try to post by hand.
  let status: CreatableStatus = 'available'
  const rawStatus = form.get('status')
  if (rawStatus != null && rawStatus !== '') {
    if (!isCreatableStatus(rawStatus)) return fail(STATUS_MESSAGE)
    status = rawStatus
  }

  return { ok: true, values: { ...fields.values, status } }
}

/**
 * The same fields, with edit's rules for `status`.
 *
 * `currentStatus` is read from the row by the action, never from the form — the
 * lock below is only a lock if the thing it locks on is the database's answer.
 *
 * Two ways this differs from create:
 *   * A Property already at `rented` stays there whatever was posted. There is
 *     no Rental-management flow that could end the tenancy (ADR 0009), so the
 *     form hides the field — and this is what makes a hand-built POST hiding
 *     nothing hit the same wall.
 *   * Blank or absent means *no change*, not `'available'`. Create's default is
 *     right for a row that does not exist yet; on edit it would quietly demote a
 *     `reserved` Property the moment somebody saved a price correction.
 */
export function parsePropertyEditForm(
  form: FormLike,
  currentStatus: PropertyStatus,
): Parsed<PropertyFields & { status: PropertyStatus }> {
  const fields = parsePropertyFields(form)
  if (!fields.ok) return fields

  if (currentStatus === 'rented') {
    return { ok: true, values: { ...fields.values, status: 'rented' } }
  }

  const rawStatus = form.get('status')
  if (rawStatus == null || rawStatus === '') {
    return { ok: true, values: { ...fields.values, status: currentStatus } }
  }
  if (!isCreatableStatus(rawStatus)) return fail(STATUS_MESSAGE)

  return { ok: true, values: { ...fields.values, status: rawStatus } }
}

const STATUS_MESSAGE =
  'สถานะต้องเป็น ว่าง หรือ จอง — ทรัพย์จะเป็น "มีผู้เช่า" ก็ต่อเมื่อมีสัญญาเช่า'

function parsePropertyFields(form: FormLike): Parsed<PropertyFields> {
  const propertyType = form.get('property_type')
  if (!isPropertyType(propertyType)) return fail('เลือกประเภททรัพย์ — คอนโด บ้าน หรือทาวน์โฮม')

  const price = number(form.get('price_monthly'), {
    label: 'ค่าเช่าต่อเดือน',
    min: 0,
    max: MAX_PRICE,
    required: true,
  })
  if (!price.ok) return price

  const bedrooms = number(form.get('bedrooms'), {
    label: 'จำนวนห้องนอน',
    min: 0,
    max: MAX_ROOMS,
    integer: true,
  })
  if (!bedrooms.ok) return bedrooms

  const bathrooms = number(form.get('bathrooms'), {
    label: 'จำนวนห้องน้ำ',
    min: 0,
    max: MAX_ROOMS,
    integer: true,
  })
  if (!bathrooms.ok) return bathrooms

  const area = number(form.get('area_sqm'), { label: 'ขนาดพื้นที่', min: 0, max: MAX_AREA })
  if (!area.ok) return area

  const floor = number(form.get('floor'), {
    label: 'ชั้น',
    min: MIN_FLOOR,
    max: MAX_FLOOR,
    integer: true,
  })
  if (!floor.ok) return floor

  return {
    ok: true,
    values: {
      property_type: propertyType,
      price_monthly: price.values ?? 0,
      // The columns default these to 0, so a blank field means 0 rather than a
      // missing answer — an unspecified bedroom count is a studio often enough.
      bedrooms: bedrooms.values ?? 0,
      bathrooms: bathrooms.values ?? 0,
      area_sqm: area.values ?? 0,
      floor: floor.values,
      room_number: blankToNull(form.get('room_number'), MAX_ROOM_NUMBER),
      description: blankToNull(form.get('description'), MAX_DESCRIPTION),
      contact_line: blankToNull(form.get('contact_line'), 100),
    },
  }
}

// ─── The Building a Property belongs to ──────────────────────────────────────

/** What the โครงการ combobox posts: an existing Building, or a name for one
 *  that does not exist yet. Never both — an id wins, because it is the one the
 *  person actually picked off the list. */
export interface BuildingChoice {
  buildingId: string | null
  /** Set only when nothing was picked: the action creates the Building. */
  newName: string | null
}

export function parseBuildingChoice(form: FormLike): Parsed<BuildingChoice> {
  const buildingId = cleanText(form.get('building_id'), 40)
  if (buildingId) return { ok: true, values: { buildingId, newName: null } }

  const typed = cleanText(form.get('building_name'), MAX_TITLE)
  if (!typed) return fail('เลือกโครงการ หรือพิมพ์ชื่อโครงการใหม่')

  return { ok: true, values: { buildingId: null, newName: typed } }
}

/**
 * A Property's title: its Building's name and its room number.
 *
 * The Building's name comes from the database, never from the form — the form
 * only says *which* Building, and a title assembled out of text the caller
 * supplied could name one Building while pointing at another. `title` is
 * NOT NULL with a non-empty CHECK, and a Building's name is non-empty by the
 * same kind of constraint, so this can never produce a blank.
 */
export function composePropertyTitle(
  buildingName: string,
  roomNumber: string | null | undefined,
): string {
  const name = buildingName.trim()
  const room = (roomNumber ?? '').trim()
  return room ? `${name} ${room}` : name
}

// ─── Images ──────────────────────────────────────────────────────────────────
// The bucket enforces its own limits (0002_storage.sql: 5 MB, four image types)
// and would reject a bad file on its own — with a message from Supabase, after
// the bytes have crossed the network. These are the same limits said early, in
// Thai, naming the number (CLAUDE.md: errors say what to do next).

export const MAX_IMAGES = 8
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_IMAGES_TOTAL_BYTES = 20 * 1024 * 1024

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export const ACCEPTED_IMAGE_TYPES = Object.keys(IMAGE_EXTENSIONS)

/** The extension a stored object gets. Storage keys are `{n}.{ext}` — the
 *  person's own filename is never reused, so nothing from their desktop ends up
 *  in a path that other Members of the Org can read. */
export function imageExtension(mime: string): string | null {
  return IMAGE_EXTENSIONS[mime] ?? null
}

export interface ImageLike {
  size: number
  type: string
}

export function validateImages(files: ImageLike[]): Parsed<null> {
  if (files.length > MAX_IMAGES) {
    return fail(`ใส่รูปได้ไม่เกิน ${MAX_IMAGES} รูป ตอนนี้เลือกมา ${files.length} รูป`)
  }

  for (const file of files) {
    if (!imageExtension(file.type)) {
      return fail('รูปต้องเป็นไฟล์ JPG, PNG, WEBP หรือ GIF เท่านั้น')
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return fail(`รูปแต่ละรูปต้องไม่เกิน ${mb(MAX_IMAGE_BYTES)} MB`)
    }
  }

  const total = files.reduce((sum, f) => sum + f.size, 0)
  if (total > MAX_IMAGES_TOTAL_BYTES) {
    return fail(
      `รูปทั้งหมดรวมกันต้องไม่เกิน ${mb(MAX_IMAGES_TOTAL_BYTES)} MB ` +
        `ตอนนี้รวม ${mb(total)} MB — เอาบางรูปออกแล้วลองใหม่`,
    )
  }

  return { ok: true, values: null }
}

/**
 * The same limits for an edit, where some photos are already stored.
 *
 * `validateImages` still judges the arriving files on their own — type, each
 * file's size, and the total bytes of *this request*. `MAX_IMAGES_TOTAL_BYTES`
 * deliberately does not count the kept photos: it exists to bound one request
 * body (ADR 0007, and the `bodySizeLimit` that moves with it), and kept photos
 * are not re-transferred. `MAX_IMAGES` is about the Property, so it counts both.
 */
export function validatePropertyImageEdit(
  keptCount: number,
  newFiles: ImageLike[],
): Parsed<null> {
  const perFile = validateImages(newFiles)
  if (!perFile.ok) return perFile

  const total = keptCount + newFiles.length
  if (total > MAX_IMAGES) {
    return fail(
      `ใส่รูปได้ไม่เกิน ${MAX_IMAGES} รูป ตอนนี้จะมี ${total} รูป — เอารูปเดิมออกก่อน`,
    )
  }

  return { ok: true, values: null }
}

/** Bytes as the megabytes the message quotes. One decimal, so 5.5 does not read
 *  as 5 and leave someone re-uploading the same file. */
export function mb(bytes: number): string {
  return (Math.round((bytes / (1024 * 1024)) * 10) / 10).toString()
}

// ─── Plumbing ────────────────────────────────────────────────────────────────

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message }
}

function blankToNull(input: unknown, maxLen: number): string | null {
  return cleanText(input, maxLen) || null
}

/** A number field. Blank is `null` and the caller decides what that means;
 *  `required` makes blank an error instead. Rounded to satang, because that is
 *  the precision every numeric column here keeps. */
function number(
  input: unknown,
  opts: { label: string; min: number; max: number; integer?: boolean; required?: boolean },
): Parsed<number | null> {
  const raw = cleanText(input, 24).replace(/,/g, '')
  if (!raw) {
    if (opts.required) return fail(`ใส่${opts.label}ก่อน`)
    return { ok: true, values: null }
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fail(`${opts.label}ต้องเป็นตัวเลข`)
  if (opts.integer && !Number.isInteger(parsed)) return fail(`${opts.label}ต้องเป็นจำนวนเต็ม`)
  if (parsed < opts.min || parsed > opts.max) {
    return fail(`${opts.label}ต้องอยู่ระหว่าง ${opts.min} ถึง ${opts.max}`)
  }

  return { ok: true, values: Math.round(parsed * 100) / 100 }
}
