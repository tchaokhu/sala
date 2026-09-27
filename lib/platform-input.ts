// What the Platform form decides. Pure, like ./building-input, and for the same
// reason: this is the judgement, and it should be testable without a database.
//
// A Platform is a place an Org advertises its Properties (CONTEXT.md). Each Org
// keeps its own list, so "Livinginsider" here is this Org's row and nobody
// else's. See docs/adr/0003.

import { cleanText } from './validate'
import type { Parsed } from './property-input'

export const MAX_PLATFORM_NAME = 60
export const MAX_SORT_ORDER = 999

/** Named in the database's own columns, so the action hands it to `insert`
 *  without a second mapping to get wrong. */
export interface PlatformValues {
  name: string
  sort_order: number
  active: boolean
}

/** A checkbox that was not ticked is absent from the FormData entirely, which
 *  is why this reads presence rather than a value. */
function checked(raw: unknown): boolean {
  return raw != null && raw !== '' && raw !== 'false' && raw !== '0'
}

export function parsePlatformForm(form: { get(name: string): unknown }): Parsed<PlatformValues> {
  const name = cleanText(form.get('name'), MAX_PLATFORM_NAME)
  if (!name) return { ok: false, message: 'Enter the channel name first' }

  // Blank means "wherever the name sorts it", not a mistake — the column
  // defaults to 0 and ties break by name.
  const rawOrder = cleanText(form.get('sort_order'), 8)
  const sort_order = rawOrder === '' ? 0 : Number(rawOrder)
  if (!Number.isInteger(sort_order) || sort_order < 0 || sort_order > MAX_SORT_ORDER) {
    return { ok: false, message: `Order must be a whole number between 0 and ${MAX_SORT_ORDER}` }
  }

  return {
    ok: true,
    values: { name, sort_order, active: checked(form.get('active')) },
  }
}
