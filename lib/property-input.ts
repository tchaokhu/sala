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
import { isIsoDate } from './dates'

export const PROPERTY_TYPES = ['condo', 'house', 'townhome'] as const
export type PropertyType = (typeof PROPERTY_TYPES)[number]

export function isPropertyType(value: unknown): value is PropertyType {
  return typeof value === 'string' && (PROPERTY_TYPES as readonly string[]).includes(value)
}

/** The user's word for each of them. One word per term, here and only here — the
 *  table and the form must not drift apart. */
export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  condo: 'Condo',
  house: 'House',
  townhome: 'Townhome',
}

/** `rented` is not one of them. A Property becomes occupied by having an active
 *  Rental (CONTEXT.md), and a row that claims a tenant without one renders as
 *  "Rented" beside an empty tenant column — a lie the list cannot correct. */
export const CREATABLE_STATUSES = ['available', 'reserved', 'let_elsewhere'] as const satisfies readonly PropertyStatus[]
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
  /** The Owner picker, or null for a Property with nobody on file. Optional
   *  always — a Property without a separate Owner is an ordinary Property, not
   *  an import artefact the way a Building-less one is.
   *
   *  Whether the id names a real Owner *of this Org* is not decided here: that
   *  is a read, and this function does no I/O. The action asks
   *  `ownerBelongsToOrg` before it writes. */
  owner_id: string | null
  status: CreatableStatus
  /** When a room let by another agent is expected back — optional, and only
   *  while the status is `let_elsewhere` (ADR 0016). */
  free_on: string | null
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
export type PropertyFields = Omit<NewProperty, 'status' | 'free_on'>

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

  const free = parseFreeOn(form, status)
  if (!free.ok) return free
  return { ok: true, values: { ...fields.values, status, free_on: free.values } }
}

/**
 * The same fields, with edit's rules for `status`.
 *
 * `currentStatus` and `hasActiveRental` are read from the database by the
 * action, never from the form — the lock below is only a lock if the thing it
 * locks on is the database's answer.
 *
 * Three ways this differs from create:
 *   * A Property with an active Rental keeps its status whatever was posted.
 *     Status transitions belong to the Rental flow (ADR 0009, amended): ending
 *     or deleting the Rental is what frees the room.
 *   * A Property at `rented` with no active Rental behind it — the stale kind
 *     the ETL carried over — can be set back to Available or Reserved. Edit
 *     still never *sets* `rented`; only creating a Rental does.
 *   * Blank or absent means *no change*, not `'available'`. Create's default is
 *     right for a row that does not exist yet; on edit it would quietly demote a
 *     `reserved` Property the moment somebody saved a price correction.
 */
export function parsePropertyEditForm(
  form: FormLike,
  currentStatus: PropertyStatus,
  hasActiveRental: boolean,
): Parsed<PropertyFields & { status: PropertyStatus; free_on: string | null }> {
  const fields = parsePropertyFields(form)
  if (!fields.ok) return fields

  let status: PropertyStatus = currentStatus
  const rawStatus = form.get('status')
  if (!hasActiveRental && rawStatus != null && rawStatus !== '') {
    if (!isCreatableStatus(rawStatus)) return fail(STATUS_MESSAGE)
    status = rawStatus
  }

  const free = parseFreeOn(form, status)
  if (!free.ok) return free
  return { ok: true, values: { ...fields.values, status, free_on: free.values } }
}

const STATUS_MESSAGE =
  'Status must be Available, Reserved or Let elsewhere — a Property only becomes Rented once it has a Rental'

/** The optional "Free from" date: read only for a room let elsewhere, and
 *  blank for every other status whatever was posted (ADR 0016). */
function parseFreeOn(form: FormLike, status: PropertyStatus): Parsed<string | null> {
  if (status !== 'let_elsewhere') return { ok: true, values: null }
  const raw = form.get('free_on')
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return { ok: true, values: null }
  if (!isIsoDate(value)) return fail('Free from must be a date — pick it from the calendar, or leave it blank')
  return { ok: true, values: value }
}

function parsePropertyFields(form: FormLike): Parsed<PropertyFields> {
  const propertyType = form.get('property_type')
  if (!isPropertyType(propertyType)) {
    return fail('Choose a property type — Condo, House or Townhome')
  }

  const price = number(form.get('price_monthly'), {
    label: 'Rent per month',
    min: 0,
    max: MAX_PRICE,
    required: true,
  })
  if (!price.ok) return price

  const bedrooms = number(form.get('bedrooms'), {
    label: 'Bedrooms',
    min: 0,
    max: MAX_ROOMS,
    integer: true,
  })
  if (!bedrooms.ok) return bedrooms

  const bathrooms = number(form.get('bathrooms'), {
    label: 'Bathrooms',
    min: 0,
    max: MAX_ROOMS,
    integer: true,
  })
  if (!bathrooms.ok) return bathrooms

  const area = number(form.get('area_sqm'), { label: 'Area', min: 0, max: MAX_AREA })
  if (!area.ok) return area

  const floor = number(form.get('floor'), {
    label: 'Floor',
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
      // Blank means "no Owner", which is also the column's default — the picker
      // can be cleared back to nothing and that is a real answer, not a
      // half-filled form.
      owner_id: blankToNull(form.get('owner_id'), 40),
    },
  }
}

// ─── The Building a Property belongs to ──────────────────────────────────────

/** What the Building combobox posts: an existing Building, or a name for one
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
  if (!typed) return fail('Choose a Building, or type the name of a new one')

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
// the bytes have crossed the network. These are the same limits said early,
// naming the number (CLAUDE.md: errors say what to do next).

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
    return fail(`Add at most ${MAX_IMAGES} photos — you chose ${files.length}`)
  }

  for (const file of files) {
    if (!imageExtension(file.type)) {
      return fail('Photos must be JPG, PNG, WEBP or GIF files')
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return fail(`Each photo must be under ${mb(MAX_IMAGE_BYTES)} MB`)
    }
  }

  const total = files.reduce((sum, f) => sum + f.size, 0)
  if (total > MAX_IMAGES_TOTAL_BYTES) {
    return fail(
      `The photos must come to under ${mb(MAX_IMAGES_TOTAL_BYTES)} MB in total ` +
        `— these come to ${mb(total)} MB. Remove some and try again.`,
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
      `A Property holds at most ${MAX_IMAGES} photos — this would make ${total}. ` +
        `Remove some of the photos already there first.`,
    )
  }

  return { ok: true, values: null }
}

/**
 * The order of a Property's photos after an edit: `properties.images` is an
 * ordered array and its first photo is the cover. The form posts `image_order`,
 * one entry per photo in the order shown — `path:<stored path>` for a kept one,
 * `new:<n>` for the n-th uploaded file.
 *
 * The request decides nothing on its own, as with `removed_images`: an entry
 * naming a path this Property does not keep, an upload that does not exist, or
 * anything twice is refused. A photo the order leaves out keeps today's place —
 * kept ones first, then the new — so an old form that posts no order at all
 * saves as it always did.
 */
export function orderImages(order: string[], kept: string[], uploaded: string[]): Parsed<string[]> {
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of order) {
    let path: string | undefined
    if (entry.startsWith('path:')) path = kept.includes(entry.slice(5)) ? entry.slice(5) : undefined
    else if (/^new:\d+$/.test(entry)) path = uploaded[Number(entry.slice(4))]
    if (!path || seen.has(path)) return fail('The photo order did not match the photos. Reload the page and try again.')
    seen.add(path)
    out.push(path)
  }
  for (const path of [...kept, ...uploaded]) if (!seen.has(path)) out.push(path)
  return { ok: true, values: out }
}

/** Bytes as the megabytes the message quotes. One decimal, so 5.5 does not read
 *  as 5 and leave someone re-uploading the same file. */
export function mb(bytes: number): string {
  return (Math.round((bytes / (1024 * 1024)) * 10) / 10).toString()
}

// ─── Plumbing ────────────────────────────────────────────────────────────────

export function fail(message: string): { ok: false; message: string } {
  return { ok: false, message }
}

export function blankToNull(input: unknown, maxLen: number): string | null {
  return cleanText(input, maxLen) || null
}

/** A number field. Blank is `null` and the caller decides what that means;
 *  `required` makes blank an error instead. Rounded to satang, because that is
 *  the precision every numeric column here keeps. Shared with
 *  lib/rental-input.ts, whose money columns are the same numeric(12,2). */
export function number(
  input: unknown,
  opts: { label: string; min: number; max: number; integer?: boolean; required?: boolean },
): Parsed<number | null> {
  const raw = cleanText(input, 24).replace(/,/g, '')
  if (!raw) {
    if (opts.required) return fail(`${opts.label} is required`)
    return { ok: true, values: null }
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fail(`${opts.label} must be a number`)
  if (opts.integer && !Number.isInteger(parsed)) return fail(`${opts.label} must be a whole number`)
  if (parsed < opts.min || parsed > opts.max) {
    return fail(`${opts.label} must be between ${opts.min} and ${opts.max}`)
  }

  return { ok: true, values: Math.round(parsed * 100) / 100 }
}
