// What the Owner form decides. Pure, like ./building-input, and for the same
// reason: this is the judgement, and it should be testable without a database.
//
// An Owner is the person who owns a Property and entrusts it to the Org
// (CONTEXT.md). Two fields are not negotiable — `owners.name` carries a
// non-empty CHECK and `owners.phone` is NOT NULL — and both are refused here,
// with a message, rather than reaching Postgres and coming back as text nobody
// outside this repo can act on.
//
// No `source`: the column exists, nothing sets it, and it has no established
// meaning. A form field for it would invent one.

import { cleanText, isEmail, isPhone, safeHttpUrl } from './validate'
import type { Parsed } from './property-input'

export const MAX_OWNER_NAME = 200
export const MAX_OWNER_NOTE = 2000

/** Named in the database's own columns, so the action hands it to `insert`
 *  without a second mapping to get wrong. */
export interface OwnerValues {
  name: string
  phone: string
  email: string | null
  line_id: string | null
  facebook_url: string | null
  note: string | null
}

/**
 * Read the form, or say what is wrong with it in words the person can act on.
 *
 * Stops at the first problem, like `parsePropertyForm`: one fixable thing at a
 * time, and the fields are independent so fixing them in order terminates.
 */
export function parseOwnerForm(form: { get(name: string): unknown }): Parsed<OwnerValues> {
  const name = cleanText(form.get('name'), MAX_OWNER_NAME)
  if (!name) return { ok: false, message: 'Enter the Owner name first' }

  const phone = cleanText(form.get('phone'), 40)
  if (!phone) return { ok: false, message: 'Enter a phone number — it is how an Owner is reached, and how two Owners with the same name are told apart' }
  if (!isPhone(phone)) {
    return {
      ok: false,
      message: 'The phone number must be digits, 6 to 15 of them, optionally starting with + — for example 081 234 5678',
    }
  }

  // Optional, but wrong is not the same as absent: a typed address that cannot
  // be an address is a mistake worth naming now rather than the day somebody
  // tries to use it.
  const email = cleanText(form.get('email'), 200) || null
  if (email && !isEmail(email)) {
    return { ok: false, message: 'That email address does not look right — check it for a typo' }
  }

  const rawFacebook = cleanText(form.get('facebook_url'), 2000)
  // safeHttpUrl, the same guard the Building's map link uses: it refuses
  // javascript: and data: links, which is what matters for something the page
  // will later render as an anchor.
  const facebook_url = rawFacebook ? safeHttpUrl(rawFacebook) : null
  if (rawFacebook && !facebook_url) {
    return { ok: false, message: 'The Facebook link must start with http:// or https://' }
  }

  return {
    ok: true,
    values: {
      name,
      phone,
      email,
      line_id: cleanText(form.get('line_id'), 100) || null,
      facebook_url,
      note: cleanText(form.get('note'), MAX_OWNER_NOTE) || null,
    },
  }
}
