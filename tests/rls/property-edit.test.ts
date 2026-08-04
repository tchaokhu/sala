/**
 * Editing a Property, against the real policies.
 *
 * `property-create.test.ts` covers the INSERT half; this is UPDATE, where the
 * refusal looks different and is easier to mistake for success. An INSERT that
 * breaks WITH CHECK throws. An UPDATE whose USING clause excludes the row
 * simply matches nothing: no error, no rows, and `updateProperty`'s own
 * `.eq('org_id', org.id)` filter would produce exactly the same zero either
 * way. So the assertion here is that the row is untouched *without* the
 * action's filter helping — the policy on its own has to be what stops it.
 *
 *   docker compose up -d && npm run db:reset && npx vitest run tests/rls/property-edit.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://sala:sala@localhost:54329/sala'

const ORG_A = '0a000000-0000-0000-0000-0000000000c3'
const ORG_B = '0b000000-0000-0000-0000-0000000000c3'
const MEMBER_A = 'aa000000-0000-0000-0000-0000000000c3'
const OUTSIDER = 'cc000000-0000-0000-0000-0000000000c3'

const PROP_A = 'da000000-0000-0000-0000-0000000000c3'
const PROP_B = 'db000000-0000-0000-0000-0000000000c3'

const TITLE_A = 'ลุมพินี A 12/34'
const TITLE_B = 'ศุภาลัย B 56/78'

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

/** One UPDATE, as a signed-in user, rolled back whatever happens. No `org_id`
 *  in the WHERE clause on purpose — the point is what the policy does when the
 *  application layer offers no help at all. Returns rows written: 0 when the
 *  USING clause hid the row, and a throw when WITH CHECK refused the new one. */
async function renameAs(who: string, property: string, title: string): Promise<number> {
  await client.query('BEGIN')
  try {
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [who])
    await client.query('SET LOCAL ROLE authenticated')
    const { rowCount } = await client.query(
      `UPDATE properties SET title = $2 WHERE id = $1`,
      [property, title],
    )
    return rowCount ?? 0
  } finally {
    await client.query('ROLLBACK')
  }
}

/** The other direction: keeping the row but re-addressing it to another Org. */
async function moveToOrgAs(who: string, property: string, org: string): Promise<number> {
  await client.query('BEGIN')
  try {
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [who])
    await client.query('SET LOCAL ROLE authenticated')
    const { rowCount } = await client.query(
      `UPDATE properties SET org_id = $2 WHERE id = $1`,
      [property, org],
    )
    return rowCount ?? 0
  } finally {
    await client.query('ROLLBACK')
  }
}

async function titleOf(property: string): Promise<string | null> {
  const { rows } = await client.query('SELECT title FROM properties WHERE id = $1', [property])
  return rows[0]?.title ?? null
}

beforeAll(async () => {
  if (!reachable) return
  await client.query('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await client.query(
    `INSERT INTO orgs (id, slug, name) VALUES ($1, 'edit-a', 'Edit A'), ($2, 'edit-b', 'Edit B')`,
    [ORG_A, ORG_B],
  )
  await client.query(
    `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'member')`,
    [ORG_A, MEMBER_A],
  )
  await client.query(
    `INSERT INTO properties (id, org_id, title, price_monthly, property_type) VALUES
       ($1, $3, $5, 18000, 'condo'),
       ($2, $4, $6, 22000, 'condo')`,
    [PROP_A, PROP_B, ORG_A, ORG_B, TITLE_A, TITLE_B],
  )
})

afterAll(async () => {
  if (!reachable) return
  await client.query('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await client.end()
})

describe('editing a Property', () => {
  it('has a database to inspect', () => {
    expect(
      reachable,
      `Cannot reach ${DATABASE_URL}. Run: docker compose up -d && npm run db:reset`,
    ).toBe(true)
  })

  it.runIf(reachable)('lets a Member edit a Property in their own Org', async () => {
    expect(await renameAs(MEMBER_A, PROP_A, 'ลุมพินี A 12/35')).toBe(1)
  })

  it.runIf(reachable)("refuses a Member editing another Org's Property", async () => {
    // The one that matters: a real, signed-in Member of Org A naming a row id
    // that belongs to Org B. The policy's USING clause never lets the row into
    // the statement, so this is 0 rather than an error — which is why the next
    // assertion checks the row itself.
    expect(await renameAs(MEMBER_A, PROP_B, 'ยึดมาแล้ว')).toBe(0)
    expect(await titleOf(PROP_B)).toBe(TITLE_B)
  })

  it.runIf(reachable)('refuses somebody with no Membership anywhere', async () => {
    expect(await renameAs(OUTSIDER, PROP_A, 'ของคนอื่น')).toBe(0)
    expect(await titleOf(PROP_A)).toBe(TITLE_A)
  })

  it.runIf(reachable)("refuses handing one of its own Properties to another Org", async () => {
    // WITH CHECK, not USING: the row is visible, so the statement gets to it and
    // is then refused loudly for the row it would have produced.
    await expect(moveToOrgAs(MEMBER_A, PROP_A, ORG_B)).rejects.toThrow(/row-level security/i)
  })

  it.runIf(reachable)('left both Properties as they were', async () => {
    expect(await titleOf(PROP_A)).toBe(TITLE_A)
    expect(await titleOf(PROP_B)).toBe(TITLE_B)
  })
})
