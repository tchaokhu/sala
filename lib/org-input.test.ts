import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_SLUG, MIN_SLUG, ORG_RECOVERY_DAYS, parseCreateOrgForm } from './org-input'

function form(fields: Record<string, string>) {
  return { get: (name: string) => (name in fields ? fields[name] : null) }
}

/** The shortest input that gets past every field, so a case can vary one thing. */
const valid = { name: 'Bangkok Rentals', slug: 'bkk-rentals', email: 'som@example.test' }

describe('parseCreateOrgForm', () => {
  it('takes an agency, a URL and the first Admin', () => {
    const result = parseCreateOrgForm(form(valid))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.values).toEqual({
      name: 'Bangkok Rentals',
      slug: 'bkk-rentals',
      email: 'som@example.test',
      display_name: null,
    })
  })

  it('keeps a Display Name when one is given, and null when it is blank', () => {
    // Blank clears to null so the member list falls back to the email, rather
    // than storing a string that renders as an empty cell.
    const named = parseCreateOrgForm(form({ ...valid, display_name: '  Somsri  ' }))
    expect(named.ok && named.values.display_name).toBe('Somsri')

    const blank = parseCreateOrgForm(form({ ...valid, display_name: '   ' }))
    expect(blank.ok && blank.values.display_name).toBe(null)
  })

  it('refuses a nameless agency', () => {
    expect(parseCreateOrgForm(form({ ...valid, name: '' }))).toMatchObject({ ok: false })
    expect(parseCreateOrgForm(form({ ...valid, name: '   ' }))).toMatchObject({ ok: false })
    // A form that never sent the field at all, not just an empty one.
    expect(parseCreateOrgForm(form({ slug: valid.slug, email: valid.email }))).toMatchObject({
      ok: false,
    })
  })

  it('refuses a missing URL and says what it is for', () => {
    const result = parseCreateOrgForm(form({ name: valid.name, email: valid.email }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('/o/')
  })

  it('refuses a URL the database CHECK would refuse', () => {
    // Same expression as orgs.slug's constraint (0001_init.sql:26). This copy
    // exists to tell the person while they are still looking at the field; the
    // constraint is the real guard, and tests/rls/org-lifecycle.test.ts proves
    // the two still agree.
    for (const slug of ['BKK-Rentals', 'bkk rentals', 'bkk_rentals', '-bkk', 'bkk-', 'bkk--rentals', 'ครัว']) {
      expect(parseCreateOrgForm(form({ ...valid, slug })), slug).toMatchObject({ ok: false })
    }
  })

  it('refuses a URL shorter than the constraint allows', () => {
    expect(parseCreateOrgForm(form({ ...valid, slug: 'a' }))).toMatchObject({ ok: false })
    expect(parseCreateOrgForm(form({ ...valid, slug: 'ab' }))).toMatchObject({ ok: true })
    expect(MIN_SLUG).toBe(2)
  })

  it('reports an over-long URL at its real length rather than trimming it to fit', () => {
    // cleanText is asked for 200 characters, well past MAX_SLUG, precisely so
    // this case is reported instead of being silently truncated into a valid
    // slug the person never typed.
    const slug = 'a'.repeat(MAX_SLUG + 5)
    const result = parseCreateOrgForm(form({ ...valid, slug }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain(String(MAX_SLUG + 5))
  })

  it('refuses an invalid first-Admin address', () => {
    for (const email of ['', 'som', 'som@example', 'som @example.test', '@example.test']) {
      expect(parseCreateOrgForm(form({ ...valid, email })), email).toMatchObject({ ok: false })
    }
  })

  it('lowercases the address, because GoTrue stores it that way', () => {
    // createOrg hands this to admin_user_id_by_email to decide between "invite"
    // and "already has an account"; a capital here would invite somebody twice.
    const result = parseCreateOrgForm(form({ ...valid, email: '  Som@Example.TEST ' }))
    expect(result.ok && result.values.email).toBe('som@example.test')
  })
})

describe('ORG_RECOVERY_DAYS', () => {
  it('matches the window the purge script actually enforces', () => {
    // Two copies of the 60 days: this one is what the console counts down from,
    // and scripts/purge-deleted-orgs.mjs holds the other because it cannot
    // import TypeScript. Drift would promise a Superadmin a recovery window
    // longer than the one the delete respects.
    const script = readFileSync(join(__dirname, '..', 'scripts', 'purge-deleted-orgs.mjs'), 'utf8')
    const match = script.match(/const RECOVERY_DAYS = (\d+)/)
    expect(match?.[1]).toBe(String(ORG_RECOVERY_DAYS))
  })
})
