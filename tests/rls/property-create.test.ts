/**
 * Inserting a Property, against the real policies.
 *
 * `schema-shape.test.ts` asserts that an INSERT policy exists on every table.
 * That is a shape, not a behaviour: a policy whose WITH CHECK admitted everyone
 * would satisfy it. This runs the insert three ways — as a Member of the Org, as
 * somebody with no Membership there, and as a Member naming *another* Org's id —
 * because the last one is the whole product. `createProperty` never takes an
 * org_id from the request (ADR 0002), and this is the layer that has to hold
 * even if one day something does.
 *
 *   docker compose up -d && npm run db:reset && npx vitest run tests/rls/property-create.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://sala:sala@localhost:54329/sala'

const ORG_A = '0a000000-0000-0000-0000-0000000000c2'
const ORG_B = '0b000000-0000-0000-0000-0000000000c2'
const MEMBER_A = 'aa000000-0000-0000-0000-0000000000c2'
const OUTSIDER = 'cc000000-0000-0000-0000-0000000000c2'

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

/** One insert, as a signed-in user, rolled back whatever happens. Returns the
 *  number of rows written — 0 when a policy refused it silently, and a throw
 *  when it refused it loudly. */
async function insertAs(who: string, org: string, title: string): Promise<number> {
  await client.query('BEGIN')
  try {
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [who])
    await client.query('SET LOCAL ROLE authenticated')
    const { rowCount } = await client.query(
      `INSERT INTO properties (org_id, title, price_monthly, property_type)
       VALUES ($1, $2, 18000, 'condo')`,
      [org, title],
    )
    return rowCount ?? 0
  } finally {
    await client.query('ROLLBACK')
  }
}

beforeAll(async () => {
  if (!reachable) return
  await client.query('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await client.query(
    `INSERT INTO orgs (id, slug, name) VALUES ($1, 'create-a', 'Create A'), ($2, 'create-b', 'Create B')`,
    [ORG_A, ORG_B],
  )
  await client.query(
    `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'member')`,
    [ORG_A, MEMBER_A],
  )
})

afterAll(async () => {
  if (!reachable) return
  await client.query('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await client.end()
})

describe('creating a Property', () => {
  it('has a database to inspect', () => {
    expect(
      reachable,
      `Cannot reach ${DATABASE_URL}. Run: docker compose up -d && npm run db:reset`,
    ).toBe(true)
  })

  it.runIf(reachable)('lets a Member write into their own Org', async () => {
    expect(await insertAs(MEMBER_A, ORG_A, 'ลุมพินี 12/34')).toBe(1)
  })

  it.runIf(reachable)('does not need the admin Role — every Member may', async () => {
    // CONTEXT.md: Roles never restrict which Properties a person can see, and
    // `member` is what MEMBER_A holds.
    const { rows } = await client.query(
      `SELECT role FROM memberships WHERE org_id = $1 AND user_id = $2`,
      [ORG_A, MEMBER_A],
    )
    expect(rows[0].role).toBe('member')
  })

  it.runIf(reachable)('refuses somebody with no Membership in that Org', async () => {
    await expect(insertAs(OUTSIDER, ORG_A, 'ของคนอื่น')).rejects.toThrow(/row-level security/i)
  })

  it.runIf(reachable)("refuses a Member naming another Org's id", async () => {
    // The one that matters: a caller who is legitimately signed in, writing a
    // row addressed to an Org they do not belong to.
    await expect(insertAs(MEMBER_A, ORG_B, 'ข้ามเอเจนซี่')).rejects.toThrow(/row-level security/i)
  })

  it.runIf(reachable)('leaves nothing behind when it refuses', async () => {
    const { rows } = await client.query(
      'SELECT count(*)::int AS n FROM properties WHERE org_id = ANY($1)',
      [[ORG_A, ORG_B]],
    )
    expect(rows[0].n).toBe(0)
  })
})
