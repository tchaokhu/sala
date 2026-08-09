/**
 * The other half of requireMember, proven against a real database.
 *
 * lib/require-member.test.ts shows the TypeScript refuses a caller its gateway
 * reports as a non-member. This shows the gateway's read *is* that non-member
 * report: the org-by-slug query the production gateway runs, executed as the
 * `authenticated` role with a given user, returns the Org only when a Membership
 * ties that user to it. The refusal is Row Level Security, not application code —
 * so a bug in the TypeScript cannot hand one Org's row to another Org's user.
 *
 *   docker compose up -d && npm run db:reset && npx vitest run tests/rls/require-member.test.ts
 *
 * Like schema-shape.test.ts this connects at module scope and skips (outside CI)
 * when the database is unreachable, rather than failing for an absent Postgres.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://sala:sala@localhost:54329/sala'

// Fixed ids so the assertions can name them. Two Orgs, two users: userA belongs
// to Org A only, userB to neither — the outsider the gate exists to stop.
const ORG_A = '0a000000-0000-0000-0000-0000000000a1'
const ORG_B = '0b000000-0000-0000-0000-0000000000b1'
const USER_A = 'aa000000-0000-0000-0000-0000000000a1'
const USER_B = 'bb000000-0000-0000-0000-0000000000b1'

const client = new pg.Client({ connectionString: DATABASE_URL, connectionTimeoutMillis: 3000 })
let reachable = false
try {
  await client.connect()
  reachable = true
} catch {
  if (process.env.CI) {
    throw new Error(
      `CI could not reach ${DATABASE_URL}. The RLS tests are not optional — ` +
      `start Postgres and run db:reset before the suite.`,
    )
  }
}

/** The exact read the production gateway performs, run as `who` (or as nobody
 *  when null). Wrapped in a transaction so the role switch and the JWT claim are
 *  scoped with SET LOCAL and never leak into the next case. */
async function orgBySlugAs(who: string | null, slug: string) {
  await client.query('BEGIN')
  try {
    // Empty string, not NULL: auth.uid() maps '' to NULL, modelling a request
    // that carries no subject claim at all.
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [who ?? ''])
    await client.query('SET LOCAL ROLE authenticated')
    const { rows } = await client.query(
      'SELECT id, slug, name FROM orgs WHERE slug = $1',
      [slug],
    )
    return rows
  } finally {
    await client.query('ROLLBACK')
  }
}

beforeAll(async () => {
  if (!reachable) return
  // Seed as the superuser, which bypasses RLS — the point under test is the
  // read path, not the seed. Idempotent so a re-run without db:reset is clean.
  await client.query('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await client.query(
    `INSERT INTO orgs (id, slug, name) VALUES ($1, 'cozy-keys', 'Cozy Keys'), ($2, 'other-agency', 'Other Agency')`,
    [ORG_A, ORG_B],
  )
  await client.query(
    `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'admin')`,
    [ORG_A, USER_A],
  )
})

afterAll(async () => {
  if (!reachable) return
  await client.query('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await client.end()
})

describe('org read under RLS (requireMember gateway)', () => {
  it('has a database to inspect', () => {
    expect(
      reachable,
      `Cannot reach ${DATABASE_URL}. Run: docker compose up -d && npm run db:reset`,
    ).toBe(true)
  })

  it.runIf(reachable)('returns the Org to a member', async () => {
    const rows = await orgBySlugAs(USER_A, 'cozy-keys')
    expect(rows).toEqual([{ id: ORG_A, slug: 'cozy-keys', name: 'Cozy Keys' }])
  })

  // The isolation guarantee itself: a real Org, a real signed-in user, and the
  // read still returns nothing because no Membership joins them. If this ever
  // returns a row, one agency can read another's books.
  it.runIf(reachable)('hides an Org from a non-member', async () => {
    const rows = await orgBySlugAs(USER_A, 'other-agency')
    expect(rows).toEqual([])
  })

  it.runIf(reachable)('hides an Org from a user who is a member of nothing', async () => {
    const rows = await orgBySlugAs(USER_B, 'cozy-keys')
    expect(rows).toEqual([])
  })

  it.runIf(reachable)('hides every Org from a caller with no subject claim', async () => {
    const rows = await orgBySlugAs(null, 'cozy-keys')
    expect(rows).toEqual([])
  })
})
