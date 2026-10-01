// What the Building form decides. Pure, like ./property-input, and for the same
// reason: this is the judgement, and it should be testable without a database.
//
// A Building is the named development a Property sits in (CONTEXT.md). In Sala
// it is also where a Property's map lives — one pin for the twenty units inside
// it, entered once. See docs/adr/0008.

import { normaliseMapUrl } from './google-map'
import { cleanText } from './validate'
import type { Parsed } from './property-input'

export const MAX_BUILDING_NAME = 200
/** Per list. The largest the ETL brought is 14 facilities. */
export const MAX_LIST_ITEMS = 30
export const MAX_LIST_ITEM = 100

/** Named in the database's own columns, so the action hands it to `insert`
 *  without a second mapping to get wrong. */
export interface BuildingValues {
  name: string
  name_en: string | null
  district: string
  province: string
  google_map_url: string | null
  facilities: string[]
  nearby: string[]
}

export function parseBuildingForm(form: { get(name: string): unknown }): Parsed<BuildingValues> {
  const name = cleanText(form.get('name'), MAX_BUILDING_NAME)
  if (!name) return { ok: false, message: 'Enter the Building name first' }

  // The column is NOT NULL with no default, so blank is '' rather than null —
  // and an empty district is an ordinary state, not a mistake.
  const district = cleanText(form.get('district'), 100)
  const province = cleanText(form.get('province'), 100)

  const rawMap = cleanText(form.get('google_map_url'), 2000)
  const google_map_url = rawMap ? normaliseMapUrl(rawMap) : null
  if (rawMap && !google_map_url) {
    return {
      ok: false,
      message: 'The map link must be a Google Maps link — copy it from Share in the Google Maps app',
    }
  }

  const facilities = parseList(form.get('facilities'), 'Facilities')
  if (!facilities.ok) return facilities
  const nearby = parseList(form.get('nearby'), 'Nearby')
  if (!nearby.ok) return nearby

  return {
    ok: true,
    values: {
      name,
      name_en: cleanText(form.get('name_en'), MAX_BUILDING_NAME) || null,
      district,
      province,
      google_map_url,
      facilities: facilities.values,
      nearby: nearby.values,
    },
  }
}

/**
 * One item per line. Lines, not commas: the items already on file read like
 * "Lobby + Lounge" and "Co-working / พื้นที่นั่งทำงาน", so any separator but a
 * line break would split real items. Blank lines go; a repeat (ignoring case)
 * keeps its first spelling; order is the order typed.
 */
export function parseList(raw: unknown, label: string): Parsed<string[]> {
  const lines = typeof raw === 'string' ? raw.split(/\r?\n/) : []
  const seen = new Set<string>()
  const items: string[] = []
  for (const line of lines) {
    const item = line.trim().replace(/\s+/g, ' ')
    if (!item) continue
    if (item.length > MAX_LIST_ITEM) {
      return { ok: false, message: `Keep each ${label} line under ${MAX_LIST_ITEM} characters` }
    }
    const key = item.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push(item)
  }
  if (items.length > MAX_LIST_ITEMS) {
    return { ok: false, message: `List at most ${MAX_LIST_ITEMS} ${label} — one per line` }
  }
  return { ok: true, values: items }
}
