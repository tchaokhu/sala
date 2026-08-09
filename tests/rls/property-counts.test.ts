/**
 * The counts above the Property table.
 *
 * Same reasoning as the dashboard aggregate (ADR 0005): the summary a person
 * came for is computed in Postgres, in one row, and the function is SECURITY
 * INVOKER so RLS decides which Properties it can see. The list below it is an
 * ordinary bounded SELECT — only the aggregate goes through a function.
 *
 *   docker compose up -d && npm run db:reset && npx vitest run tests/rls/property-counts.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://sala:sala@localhost:54329/sala'

const ORG_A = '0a000000-0000-0000-0000-0000000000f1'
const ORG_B = '0b000000-0000-0000-0000-0000000000f1'
const USER_A = 'aa000000-0000-0000-0000-0000000000f1'
const USER_B = 'bb000000-0000-0000-0000-0000000000f1'

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

interface Counts {
  total: number
  available: number
  reserved: number
  rented: number
}

async function countsAs(who: string | null, org: string): Promise<Counts> {
  await client.query('BEGIN')
  try {
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [who ?? ''])
    await client.query('SET LOCAL ROLE authenticated')
    const { rows } = await client.query('SELECT * FROM org_property_counts($1)', [org])
    const r = rows[0]
    return {
      total: Number(r.total),
      available: Number(r.available),
      reserved: Number(r.reserved),
      rented: Number(r.rented),
    }
  } finally {
    await client.query('ROLLBACK')
  }
}

async function seed(org: string, slug: string, statuses: string[]) {
  await client.query(`INSERT INTO orgs (id, slug, name) VALUES ($1, $2, $2)`, [org, slug])
  for (const [i, status] of statuses.entries()) {
    await client.query(
      `INSERT INTO properties (org_id, title, price_monthly, property_type, status)
       VALUES ($1, $2, 15000, 'condo', $3)`,
      [org, `${slug} ${i + 1}`, status],
    )
  }
}

beforeAll(async () => {
  if (!reachable) return
  await client.query('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await seed(ORG_A, 'count-a', ['available', 'available', 'reserved', 'rented', 'rented', 'rented'])
  // Org B is shaped to inflate every bucket if isolation ever slips.
  await seed(ORG_B, 'count-b', ['available', 'reserved', 'rented', 'rented'])
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

describe('org_property_counts', () => {
  it('has a database to inspect', () => {
    expect(
      reachable,
      `Cannot reach ${DATABASE_URL}. Run: docker compose up -d && npm run db:reset`,
    ).toBe(true)
  })

  it.runIf(reachable)('counts a Member\'s own Properties by status', async () => {
    expect(await countsAs(USER_A, ORG_A)).toEqual({
      total: 6,
      available: 2,
      reserved: 1,
      rented: 3,
    })
  })

  it.runIf(reachable)('gives a non-member zeros', async () => {
    expect(await countsAs(USER_B, ORG_A)).toEqual({
      total: 0, available: 0, reserved: 0, rented: 0,
    })
  })

  it.runIf(reachable)('gives a Member zeros for an Org they do not belong to', async () => {
    expect(await countsAs(USER_A, ORG_B)).toEqual({
      total: 0, available: 0, reserved: 0, rented: 0,
    })
  })
})
