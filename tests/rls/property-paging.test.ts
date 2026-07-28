/**
 * Keyset paging over Properties, against real rows.
 *
 * The failure this exists to catch is not theoretical: the Cozy Keys import
 * will insert every Property inside one transaction, so they share a
 * created_at to the microsecond. A cursor on the timestamp alone then either
 * repeats rows forever or skips a page's worth, and both look like a working
 * list until someone counts.
 *
 * lib/properties.test.ts pins the filter string that PostgREST is sent. This
 * runs the same predicate as SQL, over rows that all share a timestamp, and
 * walks the whole table a page at a time. What it does not cover is PostgREST's
 * own translation of that filter — that half is exercised by using the page.
 *
 *   docker compose up -d && npm run db:reset && npx vitest run tests/rls/property-paging.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://sala:sala@localhost:54329/sala'

const ORG_A = '0a000000-0000-0000-0000-0000000000c1'
const ORG_B = '0b000000-0000-0000-0000-0000000000c1'
const USER_A = 'aa000000-0000-0000-0000-0000000000c1'

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

interface Row { id: string; title: string; created_at: string }

/** One page, as the signed-in user, using the predicate lib/cursor.ts encodes
 *  and lib/properties.ts sends. `after` null means the first page. */
async function pageAs(
  who: string,
  org: string,
  limit: number,
  after: { createdAt: string; id: string } | null,
): Promise<Row[]> {
  await client.query('BEGIN')
  try {
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [who])
    await client.query('SET LOCAL ROLE authenticated')
    // created_at comes back as text and goes back in as text, cast in the
    // query. A JavaScript Date holds milliseconds where Postgres holds
    // microseconds, so letting the driver marshal it truncates the cursor —
    // which is the bug this file caught, and would then hide.
    const where = after
      ? `AND (created_at < $3::timestamptz OR (created_at = $3::timestamptz AND id < $4))`
      : ''
    const params: unknown[] = [org, limit]
    if (after) params.push(after.createdAt, after.id)
    const { rows } = await client.query(
      `SELECT id, title, created_at::text AS created_at FROM properties
        WHERE org_id = $1 ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT $2`,
      params,
    )
    return rows as Row[]
  } finally {
    await client.query('ROLLBACK')
  }
}

/** Walk every page the way the page's "โหลดเพิ่ม" button does. */
async function walk(who: string, org: string, limit: number): Promise<string[]> {
  const seen: string[] = []
  let after: { createdAt: string; id: string } | null = null
  // Bounded so a paging bug fails as a wrong answer rather than an infinite loop.
  for (let guard = 0; guard < 20; guard++) {
    const rows: Row[] = await pageAs(who, org, limit, after)
    if (rows.length === 0) break
    seen.push(...rows.map((r) => r.title))
    const last = rows[rows.length - 1]
    after = { createdAt: last.created_at, id: last.id }
    if (rows.length < limit) break
  }
  return seen
}

beforeAll(async () => {
  if (!reachable) return
  await client.query('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await client.query(
    `INSERT INTO orgs (id, slug, name) VALUES ($1, 'page-a', 'Page A'), ($2, 'page-b', 'Page B')`,
    [ORG_A, ORG_B],
  )
  await client.query(
    `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [ORG_A, USER_A],
  )
  // Seven Properties written in one statement: one created_at for all of them,
  // exactly like the import will produce.
  await client.query(
    `INSERT INTO properties (org_id, title, price_monthly, property_type)
     SELECT $1, 'A-' || i, 10000, 'condo' FROM generate_series(1, 7) AS i`,
    [ORG_A],
  )
  await client.query(
    `INSERT INTO properties (org_id, title, price_monthly, property_type)
     SELECT $1, 'B-' || i, 10000, 'condo' FROM generate_series(1, 5) AS i`,
    [ORG_B],
  )
})

afterAll(async () => {
  if (!reachable) return
  await client.query('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await client.end()
})

describe('property paging', () => {
  it('has a database to inspect', () => {
    expect(
      reachable,
      `Cannot reach ${DATABASE_URL}. Run: docker compose up -d && npm run db:reset`,
    ).toBe(true)
  })

  it.runIf(reachable)('gave every row the same created_at, as the import will', async () => {
    const { rows } = await client.query(
      `SELECT count(DISTINCT created_at)::int AS n FROM properties WHERE org_id = $1`,
      [ORG_A],
    )
    expect(rows[0].n).toBe(1)
  })

  it.runIf(reachable)('sees each Property exactly once across pages', async () => {
    const seen = await walk(USER_A, ORG_A, 2)
    expect(seen).toHaveLength(7)
    expect(new Set(seen).size).toBe(7)
  })

  it.runIf(reachable)('reaches the same rows whatever the page size', async () => {
    const byTwo = await walk(USER_A, ORG_A, 2)
    const byThree = await walk(USER_A, ORG_A, 3)
    const inOneGo = await walk(USER_A, ORG_A, 50)
    expect(byThree).toEqual(byTwo)
    expect(inOneGo).toEqual(byTwo)
  })

  it.runIf(reachable)('never crosses into another Org while paging', async () => {
    const seen = await walk(USER_A, ORG_A, 2)
    expect(seen.filter((t) => t.startsWith('B-'))).toEqual([])
    // And the outsider's own walk of Org B's id returns nothing at all.
    expect(await walk(USER_A, ORG_B, 2)).toEqual([])
  })
})
