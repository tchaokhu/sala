/**
 * Platforms and Postings, against the real policies and the real constraints.
 *
 * `schema-shape.test.ts` asserts that both tables carry RLS and a policy per
 * operation. That is a shape. This is the behaviour underneath it, plus the two
 * claims 0011 makes in prose that only the database can confirm: that a channel
 * with history cannot be deleted, and that deleting a Property takes its
 * Postings with it.
 *
 * The last group covers the PostgREST filter `listProperties` uses for "posted
 * nowhere". It reads like it should not work — `postings=is.null` on a to-many
 * embed — so it is asserted here as the NOT EXISTS it compiles to, against the
 * same rows the tile counts.
 *
 *   docker compose up -d && npm run db:reset && npx vitest run tests/rls/postings.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://sala:sala@localhost:54329/sala'

const ORG_A = '0a000000-0000-0000-0000-0000000000e2'
const ORG_B = '0b000000-0000-0000-0000-0000000000e2'
const MEMBER_A = 'aa000000-0000-0000-0000-0000000000e2'
const MEMBER_B = 'bb000000-0000-0000-0000-0000000000e2'

const PROP_A = '11000000-0000-0000-0000-0000000000e2'
const PROP_A2 = '12000000-0000-0000-0000-0000000000e2'
const PROP_B = '13000000-0000-0000-0000-0000000000e2'
const PLAT_A = '21000000-0000-0000-0000-0000000000e2'
const PLAT_B = '22000000-0000-0000-0000-0000000000e2'

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

/** Run one statement as a signed-in user, always rolled back. Returns the row
 *  count — 0 when a policy refused silently, a throw when it refused loudly. */
async function asUser(who: string, sql: string, params: unknown[] = []): Promise<number> {
  await client.query('BEGIN')
  try {
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [who])
    await client.query('SET LOCAL ROLE authenticated')
    const { rowCount } = await client.query(sql, params)
    return rowCount ?? 0
  } finally {
    await client.query('ROLLBACK')
  }
}

beforeAll(async () => {
  if (!reachable) return
  await client.query('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await client.query(
    `INSERT INTO orgs (id, slug, name) VALUES ($1,'post-a','Post A'), ($2,'post-b','Post B')`,
    [ORG_A, ORG_B],
  )
  await client.query(
    `INSERT INTO memberships (org_id, user_id, role) VALUES ($1,$2,'member'), ($3,$4,'member')`,
    [ORG_A, MEMBER_A, ORG_B, MEMBER_B],
  )
  await client.query(
    `INSERT INTO properties (id, org_id, title, price_monthly, property_type) VALUES
       ($1,$2,'A posted',18000,'condo'),
       ($3,$2,'A bare',18000,'condo'),
       ($4,$5,'B room',18000,'condo')`,
    [PROP_A, ORG_A, PROP_A2, PROP_B, ORG_B],
  )
  await client.query(
    `INSERT INTO platforms (id, org_id, name) VALUES ($1,$2,'Livinginsider'), ($3,$4,'Facebook')`,
    [PLAT_A, ORG_A, PLAT_B, ORG_B],
  )
  await client.query(
    `INSERT INTO postings (org_id, property_id, platform_id) VALUES ($1,$2,$3)`,
    [ORG_A, PROP_A, PLAT_A],
  )
})

afterAll(async () => {
  if (!reachable) return
  await client.query('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await client.end()
})

describe('Platforms and Postings across Orgs', () => {
  it('has a database to inspect', () => {
    expect(
      reachable,
      `Cannot reach ${DATABASE_URL}. Run: docker compose up -d && npm run db:reset`,
    ).toBe(true)
  })

  it.runIf(reachable)('a Member reads only their own Org’s Platforms', async () => {
    await client.query('BEGIN')
    try {
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [MEMBER_A])
      await client.query('SET LOCAL ROLE authenticated')
      const { rows } = await client.query('SELECT id FROM platforms ORDER BY name')
      expect(rows.map((r) => r.id)).toEqual([PLAT_A])
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it.runIf(reachable)('a Member reads only their own Org’s Postings', async () => {
    await client.query('BEGIN')
    try {
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [MEMBER_B])
      await client.query('SET LOCAL ROLE authenticated')
      const { rows } = await client.query('SELECT count(*)::int AS n FROM postings')
      expect(rows[0].n).toBe(0)
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it.runIf(reachable)('refuses a Posting addressed to another Org', async () => {
    await expect(
      asUser(
        MEMBER_A,
        `INSERT INTO postings (org_id, property_id, platform_id) VALUES ($1,$2,$3)`,
        [ORG_B, PROP_B, PLAT_B],
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it.runIf(reachable)(
    'refuses a Posting naming another Org’s Platform, even under its own org_id',
    async () => {
      // The row would be a lie: org A's Posting pointing at org B's channel.
      // RLS admits the org_id, so it is the composite key from 0016 that
      // refuses it — (platform_id, org_id) must name a Platform in org A.
      // `ownedPlatformIds` in lib/postings.ts still checks first, so the caller
      // gets a message rather than a constraint name (ADR 0013).
      await expect(
        asUser(
          MEMBER_A,
          `INSERT INTO postings (org_id, property_id, platform_id) VALUES ($1,$2,$3)`,
          [ORG_A, PROP_A2, PLAT_B],
        ),
      ).rejects.toThrow(/postings_platform_id_fkey/)
    },
  )

  it.runIf(reachable)(
    'refuses a Posting naming another Org’s Property, even under its own org_id',
    async () => {
      await expect(
        asUser(
          MEMBER_A,
          `INSERT INTO postings (org_id, property_id, platform_id) VALUES ($1,$2,$3)`,
          [ORG_A, PROP_B, PLAT_A],
        ),
      ).rejects.toThrow(/postings_property_id_fkey/)
    },
  )

  it.runIf(reachable)('refuses an outsider writing a Platform', async () => {
    await expect(
      asUser(MEMBER_B, `INSERT INTO platforms (org_id, name) VALUES ($1,'Sneaky')`, [ORG_A]),
    ).rejects.toThrow(/row-level security/i)
  })
})

describe('what the database enforces on its own', () => {
  it.runIf(reachable)('refuses to delete a Platform that has Postings', async () => {
    // ON DELETE RESTRICT (0011). The claim in CONTEXT.md that a Platform is
    // retired rather than removed is only true if this holds.
    await expect(
      asUser(MEMBER_A, 'DELETE FROM platforms WHERE id = $1', [PLAT_A]),
    ).rejects.toThrow(/violates foreign key constraint/i)
  })

  it.runIf(reachable)('deleting a Property takes its Postings with it', async () => {
    await client.query('BEGIN')
    try {
      await client.query('DELETE FROM properties WHERE id = $1', [PROP_A])
      const { rows } = await client.query(
        'SELECT count(*)::int AS n FROM postings WHERE property_id = $1',
        [PROP_A],
      )
      expect(rows[0].n).toBe(0)
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it.runIf(reachable)('deleting an Owner clears the Property’s owner_id and nothing else', async () => {
    // 0016 made the key (owner_id, org_id). A bare SET NULL would null org_id
    // too and fail on NOT NULL; `SET NULL (owner_id)` is what keeps deleting an
    // Owner possible. Every SET NULL edge in 0016 is written the same way.
    const OWNER_A = '31000000-0000-0000-0000-0000000000e2'
    await client.query('BEGIN')
    try {
      await client.query(`INSERT INTO owners (id, org_id, name, phone) VALUES ($1,$2,'Khun A','0800000000')`, [
        OWNER_A,
        ORG_A,
      ])
      await client.query('UPDATE properties SET owner_id = $1 WHERE id = $2', [OWNER_A, PROP_A2])
      await client.query('DELETE FROM owners WHERE id = $1', [OWNER_A])
      const { rows } = await client.query(
        'SELECT owner_id, org_id FROM properties WHERE id = $1',
        [PROP_A2],
      )
      expect(rows[0]).toEqual({ owner_id: null, org_id: ORG_A })
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it.runIf(reachable)('allows one Posting per Property per Platform, not two', async () => {
    await expect(
      asUser(
        MEMBER_A,
        `INSERT INTO postings (org_id, property_id, platform_id) VALUES ($1,$2,$3)`,
        [ORG_A, PROP_A, PLAT_A],
      ),
    ).rejects.toThrow(/duplicate key value/i)
  })

  it.runIf(reachable)('refuses two channels with the same name in one Org', async () => {
    await expect(
      asUser(MEMBER_A, `INSERT INTO platforms (org_id, name) VALUES ($1,'  livinginsider ')`, [
        ORG_A,
      ]),
    ).rejects.toThrow(/duplicate key value/i)
  })

  it.runIf(reachable)('lets two Orgs each keep a channel of the same name', async () => {
    expect(
      await asUser(MEMBER_B, `INSERT INTO platforms (org_id, name) VALUES ($1,'Livinginsider')`, [
        ORG_B,
      ]),
    ).toBe(1)
  })
})

describe('posted nowhere', () => {
  it.runIf(reachable)('is the NOT EXISTS the Properties filter compiles to', async () => {
    const { rows } = await client.query(
      `SELECT p.id FROM properties p
        WHERE p.org_id = $1
          AND NOT EXISTS (SELECT 1 FROM postings po WHERE po.property_id = p.id)`,
      [ORG_A],
    )
    expect(rows.map((r) => r.id)).toEqual([PROP_A2])
  })

  it.runIf(reachable)('is what the counts RPC reports, for available rooms only', async () => {
    await client.query('BEGIN')
    try {
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [MEMBER_A])
      await client.query('SET LOCAL ROLE authenticated')
      const { rows } = await client.query('SELECT * FROM org_property_counts($1)', [ORG_A])
      // PROP_A is posted; PROP_A2 is not. Both default to 'available'.
      expect(rows[0].total).toBe(2)
      expect(rows[0].posted_nowhere).toBe(1)
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it.runIf(reachable)('stops counting a room once it is let', async () => {
    await client.query('BEGIN')
    try {
      await client.query(`UPDATE properties SET status = 'rented' WHERE id = $1`, [PROP_A2])
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [MEMBER_A])
      await client.query('SET LOCAL ROLE authenticated')
      const { rows } = await client.query('SELECT * FROM org_property_counts($1)', [ORG_A])
      expect(rows[0].posted_nowhere).toBe(0)
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it.runIf(reachable)('does not let anon execute the counts function', async () => {
    const { rows } = await client.query(
      `SELECT has_function_privilege('anon', 'org_property_counts(uuid)', 'EXECUTE') AS granted`,
    )
    expect(rows[0].granted).toBe(false)
  })
})
