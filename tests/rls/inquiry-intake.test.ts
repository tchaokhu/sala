/**
 * The one write that arrives without a session, and the wall around it.
 *
 * A LINE bot or an automation posts a lead. It holds no Membership, no session
 * and no service role key — it holds a secret that names one Org. ADR 0002 gives
 * it a SECURITY DEFINER function rather than a policy, so `anon` never needs a
 * privilege on `inquiries` at all. Migration 0004 takes anon's table grants
 * away; these tests are what says the intake path survived that, and that it
 * still refuses everything it should.
 *
 *   docker compose up -d && npm run db:reset && npx vitest run tests/rls/inquiry-intake.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://sala:sala@localhost:54329/sala'

const ORG_A = '0a000000-0000-0000-0000-0000000000e1'
const ORG_B = '0b000000-0000-0000-0000-0000000000e1'
// 32 characters, which is the length the function insists on.
const TOKEN_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const TOKEN_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

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

/** Run `sql` as the anonymous role, the way an unauthenticated PostgREST
 *  request would. Committed rather than rolled back where the test needs to
 *  read the row back; the org rows are deleted in afterAll either way. */
async function asAnon<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  await client.query('BEGIN')
  try {
    await client.query(`SELECT set_config('request.jwt.claim.sub', '', true)`)
    await client.query('SET LOCAL ROLE anon')
    const { rows } = await client.query(sql, params)
    await client.query('COMMIT')
    return rows as T[]
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  }
}

beforeAll(async () => {
  if (!reachable) return
  await client.query('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await client.query(
    `INSERT INTO orgs (id, slug, name, intake_token_hash) VALUES
       ($1, 'intake-a', 'Intake A', digest($3, 'sha256')),
       ($2, 'intake-b', 'Intake B', digest($4, 'sha256'))`,
    [ORG_A, ORG_B, TOKEN_A, TOKEN_B],
  )
  await client.query(
    `INSERT INTO properties (id, org_id, title, price_monthly, property_type)
     VALUES ('0c000000-0000-0000-0000-0000000000e1', $1, 'B unit', 15000, 'condo')`,
    [ORG_B],
  )
})

afterAll(async () => {
  if (!reachable) return
  await client.query('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await client.end()
})

describe('inquiry intake', () => {
  it('has a database to inspect', () => {
    expect(
      reachable,
      `Cannot reach ${DATABASE_URL}. Run: docker compose up -d && npm run db:reset`,
    ).toBe(true)
  })

  it.runIf(reachable)('lets a token holder file a lead without any table grant', async () => {
    const rows = await asAnon<{ create_inquiry_via_token: string }>(
      `SELECT create_inquiry_via_token($1, $2, $3)`,
      [TOKEN_A, '  คุณสมชาย  ', ' 0812345678 '],
    )
    const id = rows[0].create_inquiry_via_token

    const { rows: saved } = await client.query(
      'SELECT org_id, name, phone, status FROM inquiries WHERE id = $1',
      [id],
    )
    expect(saved).toEqual([
      { org_id: ORG_A, name: 'คุณสมชาย', phone: '0812345678', status: 'new' },
    ])
  })

  // The secret names the Org. Nothing in the arguments is trusted to.
  it.runIf(reachable)('files the lead under the token\'s Org, never a claimed one', async () => {
    const rows = await asAnon<{ create_inquiry_via_token: string }>(
      `SELECT create_inquiry_via_token($1, $2, $3, NULL, NULL, NULL, $4)`,
      [TOKEN_A, 'Probe', '0800000000', '0c000000-0000-0000-0000-0000000000e1'],
    )
    const { rows: saved } = await client.query(
      'SELECT org_id, property_id FROM inquiries WHERE id = $1',
      [rows[0].create_inquiry_via_token],
    )
    // The Property belongs to Org B, so it is dropped rather than honoured —
    // and the lead still lands in Org A, where the token points.
    expect(saved).toEqual([{ org_id: ORG_A, property_id: null }])
  })

  it.runIf(reachable)('refuses a token that names no Org', async () => {
    await expect(
      asAnon(`SELECT create_inquiry_via_token($1, $2, $3)`, [
        'cccccccccccccccccccccccccccccccc', 'Probe', '0800000000',
      ]),
    ).rejects.toThrow(/invalid intake token/)
  })

  it.runIf(reachable)('refuses a token too short to be one', async () => {
    await expect(
      asAnon(`SELECT create_inquiry_via_token($1, $2, $3)`, ['short', 'Probe', '0800000000']),
    ).rejects.toThrow(/invalid intake token/)
  })

  // The half that migration 0004 changes: with the grant revoked this is a
  // privilege error rather than a policy refusal. Either way it does not write.
  it.runIf(reachable)('gives anon no way to write the table directly', async () => {
    await expect(
      asAnon(`INSERT INTO inquiries (org_id, name, phone) VALUES ($1, 'direct', '0800000000')`, [
        ORG_A,
      ]),
    ).rejects.toThrow(/permission denied|row-level security/)
  })

  it.runIf(reachable)('gives anon no way to read the leads back', async () => {
    await expect(asAnon(`SELECT id FROM inquiries`)).rejects.toThrow(/permission denied/)
  })
})
