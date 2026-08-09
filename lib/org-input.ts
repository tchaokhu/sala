// What the create-an-Org form decides. Pure, like ./property-input and
// ./building-input, and for the same reason: this is the judgement, and it
// should be testable without a database — or, here, without a Supabase project
// and a service role key.
//
// Creating an Org bundles inviting its first admin (ADR 0010). A Superadmin
// making an Org nobody can log into is not a useful thing to have made, so the
// first admin's address is a field of this form rather than a second trip
// through addMember.

import { cleanText, isEmail } from './validate'
import type { Parsed } from './property-input'

export const MAX_ORG_NAME = 80
export const MIN_SLUG = 2
export const MAX_SLUG = 40

/** The same expression the `orgs.slug` CHECK enforces (0001_init.sql:26).
 *  Restated here so the person is told what is wrong while they are still
 *  looking at the field; the constraint remains the real guard, because this
 *  one runs on input nobody has to send. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** How long a soft-deleted Org stays restorable. The purge script measures the
 *  same window in SQL against `deleted_at`; this copy is what the console
 *  counts down from, and it lives in a module with no I/O in it so a client
 *  component can say "N days left" without importing anything server-only. */
export const ORG_RECOVERY_DAYS = 60

/** Split the way createOrg uses it: the Org's own columns, then the person to
 *  invite into it. Named in the database's own column names on both halves, so
 *  neither insert needs a second mapping to get wrong. */
export interface NewOrg {
  slug: string
  name: string
  /** The first admin's login address. Lowercased, because GoTrue stores it that
   *  way and `admin_user_id_by_email` is asked to match it. */
  email: string
  /** Their Display Name inside this Org, or null for "fall back to the email". */
  display_name: string | null
}

export function parseCreateOrgForm(form: { get(name: string): unknown }): Parsed<NewOrg> {
  const name = cleanText(form.get('name'), MAX_ORG_NAME)
  if (!name) return { ok: false, message: 'Enter the agency name first' }

  // Read well past MAX_SLUG so an over-long one is reported as over-long,
  // with its real length, rather than silently truncated to exactly fitting.
  const slug = cleanText(form.get('slug'), 200)
  if (!slug) return { ok: false, message: 'Enter a URL for the Org — it is the /o/… part of every link its Members follow' }
  if (slug.length < MIN_SLUG || slug.length > MAX_SLUG) {
    return {
      ok: false,
      message: `The URL must be between ${MIN_SLUG} and ${MAX_SLUG} characters — this one is ${slug.length}`,
    }
  }
  if (!SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      message:
        'The URL may use lowercase letters, digits and single dashes between them — ' +
        'no spaces, capitals or underscores. "bkk-rentals" is the shape',
    }
  }

  const email = cleanText(form.get('email'), 254).toLowerCase()
  if (!isEmail(email)) {
    return { ok: false, message: 'That email is not valid. Check it and enter it again.' }
  }

  return {
    ok: true,
    values: {
      slug,
      name,
      email,
      // Blank clears to null and the member list shows the email instead,
      // rather than storing a string that renders as an empty cell.
      display_name: cleanText(form.get('display_name'), 80) || null,
    },
  }
}
