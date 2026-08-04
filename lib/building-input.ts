// What the โครงการ form decides. Pure, like ./property-input, and for the same
// reason: this is the judgement, and it should be testable without a database.
//
// A Building is the named development a Property sits in (CONTEXT.md). In Sala
// it is also where a Property's map lives — one pin for the twenty units inside
// it, entered once. See docs/adr/0008.

import { normaliseMapUrl } from './google-map'
import { cleanText } from './validate'
import type { Parsed } from './property-input'

export const MAX_BUILDING_NAME = 200

/** Named in the database's own columns, so the action hands it to `insert`
 *  without a second mapping to get wrong. */
export interface BuildingValues {
  name: string
  name_en: string | null
  district: string
  province: string
  google_map_url: string | null
}

export function parseBuildingForm(form: { get(name: string): unknown }): Parsed<BuildingValues> {
  const name = cleanText(form.get('name'), MAX_BUILDING_NAME)
  if (!name) return { ok: false, message: 'ใส่ชื่อโครงการก่อน' }

  // The column is NOT NULL with no default, so blank is '' rather than null —
  // and an empty district is an ordinary state, not a mistake.
  const district = cleanText(form.get('district'), 100)
  const province = cleanText(form.get('province'), 100)

  const rawMap = cleanText(form.get('google_map_url'), 2000)
  const google_map_url = rawMap ? normaliseMapUrl(rawMap) : null
  if (rawMap && !google_map_url) {
    return {
      ok: false,
      message: 'ลิงก์แผนที่ต้องเป็นลิงก์ Google Maps — คัดลอกจากปุ่มแชร์ในแอป Google Maps',
    }
  }

  return {
    ok: true,
    values: {
      name,
      name_en: cleanText(form.get('name_en'), MAX_BUILDING_NAME) || null,
      district,
      province,
      google_map_url,
    },
  }
}
