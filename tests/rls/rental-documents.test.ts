/**
 * Rental Documents (0001, 0016, 0019), read and written as a signed-in Member.
 *
 * The object half — bytes in `sala-docs`, its org-prefixed policies, signed
 * URLs — is not here: the local database has no `storage` schema (ADR 0007),
 * so that is the manual pass on the project. What is here is everything the
 * rows alone decide: RLS on `rental_documents`, the composite key, `kind`, and
 * `org_rental_counts.no_contract`.
 *
 * `asMember` rolls back and is for reads and allowed writes; `committedAs`
 * autocommits one statement, as PostgREST does, so "refused and wrote nothing"
 * is checked against what actually persisted.
 *
 *   docker compose up -d && npm run db:reset && npx vitest run tests/rls/rental-documents.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { DOCUMENT_KINDS } from '@/lib/document-input'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://sala:sala@localhost:54329/sala'

const ORG_A = '0a000000-0000-0000-0000-0000000000a9'
const ORG_B = '0b000000-0000-0000-0000-0000000000a9'
const MEMBER_A = 'aa000000-0000-0000-0000-0000000000a9'
const MEMBER_B = 'bb000000-0000-0000-0000-0000000000a9'

const PROP_A1 = '11000000-0000-0000-0000-0000000000a9'
const PROP_A2 = '12000000-0000-0000-0000-0000000000a9'
const PROP_A3 = '13000000-0000-0000-0000-0000000000a9'
const PROP_A4 = '14000000-0000-0000-0000-0000000000a9'
const PROP_A5 = '15000000-0000-0000-0000-0000000000a9'
const PROP_B = '16000000-0000-0000-0000-0000000000a9'

const TENANT_A = '21000000-0000-0000-0000-0000000000a9'
const TENANT_A_OTHER = '22000000-0000-0000-0000-0000000000a9'
const TENANT_B = '23000000-0000-0000-0000-0000000000a9'

// PROP_A1 carries a Renew chain for TENANT_A — OLD (ended, signed contract)
// then NEW (active, only an ID copy) — and, before both, a different Tenant's
// Rental with its own contract, which is not part of that chain.
const RENTAL_A1_PRIOR = '30000000-0000-0000-0000-0000000000a9'
const RENTAL_A1_OLD = '31000000-0000-0000-0000-0000000000a9'
const RENTAL_A1_NEW = '32000000-0000-0000-0000-0000000000a9'
// Active, ours, with a contract.
const RENTAL_A2 = '33000000-0000-0000-0000-0000000000a9'
// Active, let by another agent: no Tenant, no contract, not ours to chase.
const RENTAL_A3 = '34000000-0000-0000-0000-0000000000a9'
// Active, rent tracked by us but not let by us: ours for this purpose.
const RENTAL_A4 = '35000000-0000-0000-0000-0000000000a9'
// Ended, ours, no Document at all.
const RENTAL_A5 = '36000000-0000-0000-0000-0000000000a9'
const RENTAL_B = '37000000-0000-0000-0000-0000000000a9'

const DOC_A1_PRIOR = '41000000-0000-0000-0000-0000000000a9'
const DOC_A1_OLD = '42000000-0000-0000-0000-0000000000a9'
const DOC_A1_NEW = '43000000-0000-0000-0000-0000000000a9'
const DOC_A2 = '44000000-0000-0000-0000-0000000000a9'
const DOC_A3 = '45000000-0000-0000-0000-0000000000a9'
const DOC_B = '46000000-0000-0000-0000-0000000000a9'

const TODAY = '2026-09-27'

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

async function asMember<T>(who: string, fn: () => Promise<T>): Promise<T> {
  await client.query('BEGIN')
  try {
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [who])
    await client.query('SET LOCAL ROLE authenticated')
    return await fn()
  } finally {
    await client.query('ROLLBACK')
  }
}

async function committedAs(who: string, sql: string, params: unknown[]) {
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [who])
  await client.query('SET ROLE authenticated')
  try {
    return await client.query(sql, params)
  } finally {
    await client.query('RESET ROLE')
    await client.query(`SELECT set_config('request.jwt.claim.sub', '', false)`)
  }
}

const q = (sql: string, params: unknown[] = []) => client.query(sql, params)

/** Every column a stray write could change on every Document in both Orgs,
 *  updated_at included, read as the superuser. */
async function footprint() {
  const { rows } = await q(
    `SELECT string_agg(concat_ws('|', id, org_id, rental_id, kind, storage_path, file_name, mime_type, size_bytes, updated_at),
                       ',' ORDER BY id) AS f
       FROM rental_documents WHERE org_id = ANY($1)`,
    [[ORG_A, ORG_B]],
  )
  return rows[0].f as string
}

const INSERT_SQL = `INSERT INTO rental_documents (org_id, rental_id, storage_path, file_name, mime_type, size_bytes, kind)
                    VALUES ($1, $2, $3, 'x.pdf', 'application/pdf', 1024, 'contract')`
const path = (org: string, rental: string) => `${org}/rentals/${rental}/${crypto.randomUUID()}.pdf`

beforeAll(async () => {
  if (!reachable) return
  await q('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await q(`INSERT INTO orgs (id, slug, name) VALUES ($1,'docs-a','Docs A'), ($2,'docs-b','Docs B')`, [ORG_A, ORG_B])
  await q(
    `INSERT INTO memberships (org_id, user_id, role) VALUES ($1,$2,'member'), ($3,$4,'member')`,
    [ORG_A, MEMBER_A, ORG_B, MEMBER_B],
  )
  await q(
    `INSERT INTO properties (id, org_id, title, price_monthly, property_type, status) VALUES
       ($1,$7,'A1',8000,'condo','rented'), ($2,$7,'A2',8000,'condo','rented'),
       ($3,$7,'A3',8000,'condo','rented'), ($4,$7,'A4',8000,'condo','rented'),
       ($5,$7,'A5',8000,'condo','available'), ($6,$8,'B',8000,'condo','rented')`,
    [PROP_A1, PROP_A2, PROP_A3, PROP_A4, PROP_A5, PROP_B, ORG_A, ORG_B],
  )
  await q(
    `INSERT INTO tenants (id, org_id, name) VALUES ($1,$4,'Tenant A'), ($2,$4,'Tenant A other'), ($3,$5,'Tenant B')`,
    [TENANT_A, TENANT_A_OTHER, TENANT_B, ORG_A, ORG_B],
  )
  await q(
    `INSERT INTO rentals (id, org_id, property_id, tenant_id, tenant_name_snapshot, start_date, end_date,
                          monthly_rent, deposit, commission, rented_by_us, rent_tracked_by_us, status) VALUES
       ($1, $9,  $11, $17,  'Other',  '2024-03-01','2025-02-28', 8000,0,0, true,  true,  'ended'),
       ($2, $9,  $11, $16,  'A',      '2025-03-01','2026-02-28', 8000,0,0, true,  true,  'ended'),
       ($3, $9,  $11, $16,  'A',      '2026-03-01','2027-02-28', 8000,0,0, true,  true,  'active'),
       ($4, $9,  $12, $16,  'A',      '2026-03-01','2027-02-28', 8000,0,0, true,  true,  'active'),
       ($5, $9,  $13, NULL, 'Let by another agent','2026-01-01','2026-12-31', 0,0,0, false, false, 'active'),
       ($6, $9,  $14, $16,  'A',      '2026-03-01','2027-02-28', 8000,0,0, false, true,  'active'),
       ($7, $9,  $15, $16,  'A',      '2025-03-01','2026-02-28', 8000,0,0, true,  true,  'ended'),
       ($8, $10, $18, $19,  'B',      '2026-03-01','2027-02-28', 8000,0,0, true,  true,  'active')`,
    [
      RENTAL_A1_PRIOR, RENTAL_A1_OLD, RENTAL_A1_NEW, RENTAL_A2, RENTAL_A3, RENTAL_A4, RENTAL_A5, RENTAL_B,
      ORG_A, ORG_B, PROP_A1, PROP_A2, PROP_A3, PROP_A4, PROP_A5, TENANT_A, TENANT_A_OTHER, PROP_B, TENANT_B,
    ],
  )
  const docs: [string, string, string, string][] = [
    [DOC_A1_PRIOR, ORG_A, RENTAL_A1_PRIOR, 'contract'],
    [DOC_A1_OLD, ORG_A, RENTAL_A1_OLD, 'contract'],
    [DOC_A1_NEW, ORG_A, RENTAL_A1_NEW, 'id_copy'],
    [DOC_A2, ORG_A, RENTAL_A2, 'contract'],
    [DOC_A3, ORG_A, RENTAL_A3, 'other'],
    [DOC_B, ORG_B, RENTAL_B, 'id_copy'],
  ]
  for (const [id, org, rental, kind] of docs) {
    await q(
      `INSERT INTO rental_documents (id, org_id, rental_id, storage_path, file_name, mime_type, size_bytes, kind)
       VALUES ($1, $2, $3, $4, 'บัตรประชาชน.pdf', 'application/pdf', 2048, $5)`,
      [id, org, rental, `${org}/rentals/${rental}/${id}.pdf`, kind],
    )
  }
})

afterAll(async () => {
  if (!reachable) return
  await q('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await client.end()
})

describe('rental_documents across Orgs', () => {
  it('has a database to inspect', () => {
    expect(reachable, `Cannot reach ${DATABASE_URL}. Run: docker compose up -d && npm run db:reset`).toBe(true)
  })

  it.runIf(reachable)('lets a Member read, add, change and remove their own Org’s Documents', async () => {
    await asMember(MEMBER_A, async () => {
      const seen = (await q('SELECT id FROM rental_documents WHERE org_id = $1 ORDER BY id', [ORG_A])).rows.map((r) => r.id)
      expect(seen).toEqual([DOC_A1_PRIOR, DOC_A1_OLD, DOC_A1_NEW, DOC_A2, DOC_A3])
      expect((await q(INSERT_SQL, [ORG_A, RENTAL_A4, path(ORG_A, RENTAL_A4)])).rowCount).toBe(1)
      expect((await q(`UPDATE rental_documents SET kind = 'receipt' WHERE id = $1`, [DOC_A3])).rowCount).toBe(1)
      expect((await q('DELETE FROM rental_documents WHERE id = $1', [DOC_A3])).rowCount).toBe(1)
    })
  })

  it.runIf(reachable)('shows Org B’s Member none of Org A’s Documents', async () => {
    const { rows } = await committedAs(MEMBER_B, 'SELECT id FROM rental_documents WHERE org_id = $1 OR rental_id = ANY($2)', [
      ORG_A,
      [RENTAL_A1_NEW, RENTAL_A2],
    ])
    expect(rows).toEqual([])
    // Positive control: the same caller does see its own.
    expect((await committedAs(MEMBER_B, 'SELECT id FROM rental_documents', [])).rows.map((r) => r.id)).toEqual([DOC_B])
  })

  it.runIf(reachable)('refuses Org B’s Member inserting a Document into Org A, and writes nothing', async () => {
    const before = await footprint()
    await expect(committedAs(MEMBER_B, INSERT_SQL, [ORG_A, RENTAL_A1_NEW, path(ORG_A, RENTAL_A1_NEW)])).rejects.toThrow(
      /row-level security/i,
    )
    expect(await footprint()).toEqual(before)
  })

  it.runIf(reachable)('refuses Org B’s Member naming Org A’s Rental under Org B’s own id', async () => {
    // RLS admits org_id = B; the 0016 composite key is what refuses
    // (RENTAL_A1_NEW, B) — on insert, and on moving B's own Document across.
    const before = await footprint()
    await expect(committedAs(MEMBER_B, INSERT_SQL, [ORG_B, RENTAL_A1_NEW, path(ORG_B, RENTAL_A1_NEW)])).rejects.toThrow(
      /rental_documents_rental_id_fkey/,
    )
    await expect(
      committedAs(MEMBER_B, 'UPDATE rental_documents SET rental_id = $2 WHERE id = $1', [DOC_B, RENTAL_A1_NEW]),
    ).rejects.toThrow(/rental_documents_rental_id_fkey/)
    expect(await footprint()).toEqual(before)
  })

  it.runIf(reachable)('refuses Org B’s Member changing or deleting Org A’s Documents, and changes nothing', async () => {
    // The action's own filter (id and org_id) and the bare id a hand-built
    // request would try: RLS's USING hides the row from both.
    const before = await footprint()
    for (const doc of [DOC_A1_OLD, DOC_A1_NEW, DOC_A2]) {
      for (const [where, params] of [
        ['id = $1 AND org_id = $2', [doc, ORG_A]],
        ['id = $1', [doc]],
      ] as const) {
        expect(
          (await committedAs(MEMBER_B, `UPDATE rental_documents SET kind = 'other', file_name = 'x' WHERE ${where}`, [...params])).rowCount,
        ).toBe(0)
        expect((await committedAs(MEMBER_B, `DELETE FROM rental_documents WHERE ${where}`, [...params])).rowCount).toBe(0)
      }
    }
    expect(await footprint()).toEqual(before)
  })

  it.runIf(reachable)('refuses Org B’s Member moving its own Document into Org A', async () => {
    // WITH CHECK, not USING: the row is B's and visible, the new org_id is not.
    const before = await footprint()
    await expect(
      committedAs(MEMBER_B, 'UPDATE rental_documents SET org_id = $2, rental_id = $3 WHERE id = $1', [DOC_B, ORG_A, RENTAL_A1_NEW]),
    ).rejects.toThrow(/row-level security/i)
    expect(await footprint()).toEqual(before)
  })
})

describe('kind', () => {
  it.runIf(reachable)('is exactly the kinds lib/document-input.ts offers, in order', async () => {
    const { rows } = await q(`SELECT unnest(enum_range(NULL::rental_document_kind))::text AS k`)
    expect(rows.map((r) => r.k)).toEqual([...DOCUMENT_KINDS])
  })

  it.runIf(reachable)('is NOT NULL with the backfill default dropped', async () => {
    // 0019 added it with DEFAULT 'contract' for the three ETL rows. Were the
    // default left behind, an upload that forgot its kind would quietly file
    // an ID scan as a contract — and satisfy no_contract.
    const { rows } = await q(
      `SELECT is_nullable, column_default FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'rental_documents' AND column_name = 'kind'`,
    )
    expect(rows).toEqual([{ is_nullable: 'NO', column_default: null }])
  })

  it.runIf(reachable)('refuses a Document without a kind, and one outside the list', async () => {
    const before = await footprint()
    await expect(
      committedAs(
        MEMBER_A,
        `INSERT INTO rental_documents (org_id, rental_id, storage_path, file_name, mime_type, size_bytes)
         VALUES ($1, $2, $3, 'x.pdf', 'application/pdf', 1024)`,
        [ORG_A, RENTAL_A4, path(ORG_A, RENTAL_A4)],
      ),
    ).rejects.toMatchObject({ code: '23502' })
    for (const kind of ['passport', 'Contract', '']) {
      await expect(
        committedAs(
          MEMBER_A,
          `INSERT INTO rental_documents (org_id, rental_id, storage_path, file_name, mime_type, size_bytes, kind)
           VALUES ($1, $2, $3, 'x.pdf', 'application/pdf', 1024, $4)`,
          [ORG_A, RENTAL_A4, path(ORG_A, RENTAL_A4), kind],
        ),
      ).rejects.toMatchObject({ code: '22P02' })
    }
    expect(await footprint()).toEqual(before)
  })
})

describe('org_rental_counts.no_contract', () => {
  const noContractAs = (who: string, org: string, before?: () => Promise<unknown>) =>
    asMember(who, async () => {
      await before?.()
      return (await q('SELECT no_contract FROM org_rental_counts($1, $2)', [org, TODAY])).rows[0].no_contract
    })

  it.runIf(reachable)('counts the active Rentals of ours with no contract of their own', async () => {
    // A1_NEW: only an ID copy, and its predecessor's contract is not its own.
    // A4: rent tracked by us, nothing attached. Not A2 (contract), A3 (let by
    // another agent), A5 or either ended A1 (ended).
    expect(await noContractAs(MEMBER_A, ORG_A)).toBe(2)
  })

  it.runIf(reachable)('drops a Rental once a contract of its own is attached', async () => {
    expect(
      await noContractAs(MEMBER_A, ORG_A, () => q(INSERT_SQL, [ORG_A, RENTAL_A1_NEW, path(ORG_A, RENTAL_A1_NEW)])),
    ).toBe(1)
  })

  it.runIf(reachable)('does not let a renewal inherit its predecessor’s contract', async () => {
    // A2 has a contract; renew_rental ends it and starts a successor with none.
    const n = await noContractAs(MEMBER_A, ORG_A, () =>
      q(`SELECT renew_rental($1, $2, $3::jsonb, '[]'::jsonb)`, [
        ORG_A,
        RENTAL_A2,
        JSON.stringify({ end_date: '2028-02-29', monthly_rent: 8000, commission: 0 }),
      ]),
    )
    expect(n).toBe(3)
  })

  // The two exclusions, each shown to be the reason: flip only the one fact
  // and the Rental is counted.
  it.runIf(reachable)('leaves out A3 because it is let by another agent', async () => {
    expect(
      await noContractAs(MEMBER_A, ORG_A, () => q('UPDATE rentals SET rented_by_us = true WHERE id = $1', [RENTAL_A3])),
    ).toBe(3)
  })

  it.runIf(reachable)('leaves out A5 because it is ended', async () => {
    expect(
      await noContractAs(MEMBER_A, ORG_A, () => q(`UPDATE rentals SET status = 'active' WHERE id = $1`, [RENTAL_A5])),
    ).toBe(3)
  })

  it.runIf(reachable)('gives Org B’s Member zero for Org A, and each Org its own', async () => {
    expect(await noContractAs(MEMBER_B, ORG_A)).toBe(0)
    expect(await noContractAs(MEMBER_A, ORG_B)).toBe(0)
    // RENTAL_B has only an ID copy.
    expect(await noContractAs(MEMBER_B, ORG_B)).toBe(1)
  })

  it.runIf(reachable)('cannot be executed by anon', async () => {
    const { rows } = await q(
      `SELECT has_function_privilege('anon', 'org_rental_counts(uuid,date)', 'EXECUTE') AS anon,
              has_function_privilege('authenticated', 'org_rental_counts(uuid,date)', 'EXECUTE') AS authed`,
    )
    expect(rows[0]).toEqual({ anon: false, authed: true })
  })
})

describe('delete_rental with a kinded Document', () => {
  it.runIf(reachable)('still refuses (SL002), and deletes nothing', async () => {
    // A4 has no Payment, so the Document it is given here is the only reason
    // to refuse. Committed, so the refusal is shown to have kept both rows.
    const doc = await q(
      `INSERT INTO rental_documents (org_id, rental_id, storage_path, file_name, mime_type, size_bytes, kind)
       VALUES ($1, $2, $3, 'id.jpg', 'image/jpeg', 1024, 'id_copy') RETURNING id`,
      [ORG_A, RENTAL_A4, path(ORG_A, RENTAL_A4)],
    )
    try {
      expect((await q('SELECT count(*)::int AS n FROM payments WHERE rental_id = $1', [RENTAL_A4])).rows[0].n).toBe(0)
      const before = await footprint()
      await expect(committedAs(MEMBER_A, 'SELECT delete_rental($1, $2)', [ORG_A, RENTAL_A4])).rejects.toMatchObject({
        code: 'SL002',
      })
      expect(await footprint()).toEqual(before)
      expect((await q('SELECT count(*)::int AS n FROM rentals WHERE id = $1', [RENTAL_A4])).rows[0].n).toBe(1)
    } finally {
      await q('DELETE FROM rental_documents WHERE id = $1', [doc.rows[0].id])
    }
  })
})

// listRentalDocuments reads the chain through PostgREST, which the local
// database does not serve. This is the same predicate in SQL — earlier Rentals
// with this one's property_id and tenant_id, start_date <= its own, and only
// its own Documents when it has no Tenant — run as the caller, over Rentals
// renew_rental actually produced. It proves the predicate finds the chain Renew
// makes; that lib/rental-documents.ts sends this predicate is the manual pass.
describe('the Renew chain listRentalDocuments reads', () => {
  const CHAIN_SQL = `
    WITH me AS (SELECT property_id, tenant_id, start_date FROM rentals WHERE id = $1 AND org_id = $2)
    SELECT d.id FROM rental_documents d JOIN rentals r ON r.id = d.rental_id CROSS JOIN me
     WHERE d.org_id = $2
       AND CASE WHEN me.tenant_id IS NULL THEN d.rental_id = $1
                ELSE r.property_id = me.property_id AND r.tenant_id = me.tenant_id AND r.start_date <= me.start_date END
     ORDER BY d.id`
  const chainAs = (who: string, rental: string, org = ORG_A) =>
    asMember(who, async () => (await q(CHAIN_SQL, [rental, org])).rows.map((r) => r.id))

  it.runIf(reachable)('gives a Rental its own Documents and its predecessors’, not another Tenant’s', async () => {
    expect(await chainAs(MEMBER_A, RENTAL_A1_NEW)).toEqual([DOC_A1_OLD, DOC_A1_NEW])
    // The first of the chain has nothing before it.
    expect(await chainAs(MEMBER_A, RENTAL_A1_OLD)).toEqual([DOC_A1_OLD])
  })

  it.runIf(reachable)('finds the chain renew_rental produces', async () => {
    const ids = await asMember(MEMBER_A, async () => {
      const next = (await q(`SELECT renew_rental($1, $2, $3::jsonb, '[]'::jsonb) AS id`, [
        ORG_A,
        RENTAL_A1_NEW,
        JSON.stringify({ end_date: '2028-02-29', monthly_rent: 8000, commission: 0 }),
      ])).rows[0].id
      return (await q(CHAIN_SQL, [next, ORG_A])).rows.map((r) => r.id)
    })
    expect(ids).toEqual([DOC_A1_OLD, DOC_A1_NEW])
  })

  it.runIf(reachable)('gives a let-by-another-agent Rental only its own', async () => {
    expect(await chainAs(MEMBER_A, RENTAL_A3)).toEqual([DOC_A3])
  })

  it.runIf(reachable)('gives Org B’s Member nothing of Org A’s chain', async () => {
    expect(await chainAs(MEMBER_B, RENTAL_A1_NEW)).toEqual([])
  })
})
