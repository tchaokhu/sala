/**
 * One Building per name in an Org (0020, buildings_org_name_key).
 *
 *   docker compose up -d && npm run db:reset && npx vitest run tests/rls/building-names.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://sala:sala@localhost:54329/sala'

const ORG_A = '0a000000-0000-0000-0000-0000000000f7'
const ORG_B = '0b000000-0000-0000-0000-0000000000f7'

const client = new pg.Client({ connectionString: DATABASE_URL, connectionTimeoutMillis: 3000 })
let reachable = false
try {
  await client.connect()
  reachable = true
} catch {
  if (process.env.CI) throw new Error(`CI could not reach ${DATABASE_URL}.`)
}

const insert = (org: string, name: string) =>
  client.query(`INSERT INTO buildings (org_id, name, district, province) VALUES ($1, $2, '', '')`, [org, name])

beforeAll(async () => {
  if (!reachable) return
  await client.query('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await client.query(
    `INSERT INTO orgs (id, slug, name) VALUES ($1, 'names-a', 'Names A'), ($2, 'names-b', 'Names B')`,
    [ORG_A, ORG_B],
  )
  await insert(ORG_A, 'ดี คอนโด บลิซ')
})

afterAll(async () => {
  if (!reachable) return
  await client.query('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await client.end()
})

describe('Building names', () => {
  it('has a database to inspect', () => {
    expect(reachable, `Cannot reach ${DATABASE_URL}. Run: docker compose up -d && npm run db:reset`).toBe(true)
  })

  it.runIf(reachable)('refuses the same name twice in one Org', async () => {
    await expect(insert(ORG_A, 'ดี คอนโด บลิซ')).rejects.toThrow(/buildings_org_name_key/)
  })

  it.runIf(reachable)('treats case and outer spaces as the same name', async () => {
    await insert(ORG_A, 'Lumpini Park')
    await expect(insert(ORG_A, '  lumpini PARK ')).rejects.toThrow(/buildings_org_name_key/)
  })

  it.runIf(reachable)('lets another Org keep a Building of the same name', async () => {
    await expect(insert(ORG_B, 'ดี คอนโด บลิซ')).resolves.toMatchObject({ rowCount: 1 })
  })
})
