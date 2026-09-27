/**
 * Payments follow the remainder (0018), called as a signed-in Member.
 *
 * Settling is a plain UPDATE through the Server Action, with no RPC in front
 * of it, so the four 0001 member policies are the whole of what keeps Org B's
 * Member off Org A's ledger. And "still owed" moved from `settled_date IS NULL`
 * to the generated `outstanding > 0`, which only a database can show the
 * functions, the list and the CHECK agree on.
 *
 * `asMember` rolls back and is for reads and allowed writes; `committedAs`
 * autocommits, as PostgREST does, and is for refusals — inside a rolled-back
 * transaction "nothing changed" is true whatever the UPDATE did.
 *
 *   docker compose up -d && npm run db:reset && npx vitest run tests/rls/payments.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://sala:sala@localhost:54329/sala'

const ORG_A = '0a000000-0000-0000-0000-0000000000a8'
const ORG_B = '0b000000-0000-0000-0000-0000000000a8'
const MEMBER_A = 'aa000000-0000-0000-0000-0000000000a8'
const MEMBER_B = 'bb000000-0000-0000-0000-0000000000a8'
const NOBODY = 'cc000000-0000-0000-0000-0000000000a8'

const PROP_A = '11000000-0000-0000-0000-0000000000a8'
const PROP_B = '12000000-0000-0000-0000-0000000000a8'
const RENTAL_A = '31000000-0000-0000-0000-0000000000a8'
const RENTAL_B = '32000000-0000-0000-0000-0000000000a8'

// ฿5,000 of ฿8,000 in, past due: the row 0018 exists for.
const PAY_PART = '41000000-0000-0000-0000-0000000000a8'
// Past due but settled in full this month: in no overdue figure.
const PAY_FULL = '42000000-0000-0000-0000-0000000000a8'
// Due in four days, nothing in.
const PAY_SOON = '43000000-0000-0000-0000-0000000000a8'
// Deposit Refund owed back out, ฿2,000 of ฿12,000 paid, past due.
const PAY_REFUND = '44000000-0000-0000-0000-0000000000a8'
// Not yet due, nothing in: for the generated-column and CHECK cases.
const PAY_OPEN = '45000000-0000-0000-0000-0000000000a8'
const PAY_B = '46000000-0000-0000-0000-0000000000a8'

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

/** Every settlement column of every Payment in both Orgs, updated_at included
 *  so a no-op UPDATE that still touched a row shows. Read as the superuser. */
async function footprint() {
  const { rows } = await q(
    `SELECT string_agg(concat_ws('|', id, settled_amount, settled_date, method, note, updated_at), ',' ORDER BY id) AS f
       FROM payments WHERE org_id = ANY($1)`,
    [[ORG_A, ORG_B]],
  )
  return rows[0].f as string
}

const num = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]))

const countsAs = (who: string, org: string) =>
  asMember(who, async () => num((await q('SELECT * FROM org_payment_counts($1, $2)', [org, TODAY])).rows[0]))

const dashboardAs = (who: string, org: string) =>
  asMember(who, async () => {
    const r = (await q('SELECT overdue_amount, overdue_count, refunds_late FROM org_dashboard($1, $2)', [org, TODAY])).rows[0]
    return num(r)
  })

beforeAll(async () => {
  if (!reachable) return
  await q('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await q(`INSERT INTO orgs (id, slug, name) VALUES ($1,'pay-a','Pay A'), ($2,'pay-b','Pay B')`, [ORG_A, ORG_B])
  await q(
    `INSERT INTO memberships (org_id, user_id, role) VALUES ($1,$2,'member'), ($3,$4,'member')`,
    [ORG_A, MEMBER_A, ORG_B, MEMBER_B],
  )
  await q(
    `INSERT INTO properties (id, org_id, title, price_monthly, property_type, status) VALUES
       ($1,$3,'A let',8000,'condo','rented'), ($2,$4,'B let',8000,'condo','rented')`,
    [PROP_A, PROP_B, ORG_A, ORG_B],
  )
  await q(
    `INSERT INTO rentals (id, org_id, property_id, tenant_name_snapshot, start_date, end_date,
                          monthly_rent, rented_by_us, rent_tracked_by_us, status) VALUES
       ($1,$3,$4,'Tenant A','2026-03-01','2027-02-28',8000,true,true,'active'),
       ($2,$5,$6,'Tenant B','2026-03-01','2027-02-28',8000,true,true,'active')`,
    [RENTAL_A, RENTAL_B, ORG_A, PROP_A, ORG_B, PROP_B],
  )
  await q(
    `INSERT INTO payments (id, org_id, rental_id, property_id, direction, type, due_date, amount,
                           settled_date, settled_amount, method) VALUES
       ($1,$7,$8,$9,'in','rent','2026-09-01',8000,'2026-09-05',5000,'transfer'),
       ($2,$7,$8,$9,'in','rent','2026-08-01',8000,'2026-09-10',8000,'cash'),
       ($3,$7,$8,$9,'in','rent','2026-10-01',8000,NULL,NULL,NULL),
       ($4,$7,$8,$9,'out','deposit_refund','2026-09-20',12000,'2026-09-21',2000,'transfer'),
       ($5,$7,$8,$9,'in','rent','2026-11-01',8000,NULL,NULL,NULL),
       ($6,$10,$11,$12,'in','rent','2026-01-01',400000,NULL,NULL,NULL)`,
    [PAY_PART, PAY_FULL, PAY_SOON, PAY_REFUND, PAY_OPEN, PAY_B, ORG_A, RENTAL_A, PROP_A, ORG_B, RENTAL_B, PROP_B],
  )
})

afterAll(async () => {
  if (!reachable) return
  await q('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await client.end()
})

describe('what is still owed', () => {
  it('has a database to inspect', () => {
    expect(reachable, `Cannot reach ${DATABASE_URL}. Run: docker compose up -d && npm run db:reset`).toBe(true)
  })

  it.runIf(reachable)('org_payment_counts counts the partly settled rent by its ฿3,000 and the refund apart', async () => {
    expect(await countsAs(MEMBER_A, ORG_A)).toEqual({
      overdue_count: 1,
      overdue_amount: 3000,
      refunds_late_count: 1,
      // The refund's outstanding, not its amount — the same rule as rent.
      refunds_late_amount: 10000,
      due_soon_count: 1,
      // PAY_FULL only. PAY_PART's last settlement is this month too, but it
      // is not settled in full.
      settled_this_month_count: 1,
    })
  })

  it.runIf(reachable)('org_dashboard agrees, and leaves the late refund out of the overdue sum', async () => {
    // Before 0018 this read 0 / 0: PAY_PART has a settled_date. And the
    // ฿10,000 refund owed out is never added to money owed in (0003).
    expect(await dashboardAs(MEMBER_A, ORG_A)).toEqual({ overdue_amount: 3000, overdue_count: 1, refunds_late: 1 })
  })

  it.runIf(reachable)('the Overdue list’s predicate selects the partly settled rent and the late refund', async () => {
    // lib/payments-data.ts' overdue filter: outstanding > 0, due before today,
    // both directions — the one list of everyone to chase (decision 3).
    const ids = await asMember(MEMBER_A, async () =>
      (await q(
        `SELECT id, outstanding::float AS outstanding FROM payments
          WHERE org_id = $1 AND outstanding > 0 AND due_date < $2 ORDER BY due_date, id`,
        [ORG_A, TODAY],
      )).rows,
    )
    expect(ids).toEqual([
      { id: PAY_PART, outstanding: 3000 },
      { id: PAY_REFUND, outstanding: 10000 },
    ])
  })

  it.runIf(reachable)('outstanding follows settled_amount, and cannot be written itself', async () => {
    await asMember(MEMBER_A, async () => {
      const read = async () =>
        Number((await q('SELECT outstanding FROM payments WHERE id = $1', [PAY_OPEN])).rows[0].outstanding)
      expect(await read()).toBe(8000)
      await q(`UPDATE payments SET settled_amount = 2500, settled_date = $2, method = 'cash' WHERE id = $1`, [PAY_OPEN, TODAY])
      expect(await read()).toBe(5500)
      await q(`UPDATE payments SET settled_amount = 8000 WHERE id = $1`, [PAY_OPEN])
      expect(await read()).toBe(0)
      await q(`UPDATE payments SET settled_amount = NULL, settled_date = NULL, method = NULL WHERE id = $1`, [PAY_OPEN])
      expect(await read()).toBe(8000)
    })
    // Every figure reads this column, so a stray write to it would hide debt.
    await expect(
      asMember(MEMBER_A, () => q('UPDATE payments SET outstanding = 0 WHERE id = $1', [PAY_OPEN])),
    ).rejects.toThrow(/"outstanding" can only be updated to DEFAULT/)
  })

  it.runIf(reachable)('the 0001 CHECK still refuses a half-written settlement', async () => {
    await expect(
      asMember(MEMBER_A, () => q('UPDATE payments SET settled_amount = 5000 WHERE id = $1', [PAY_OPEN])),
    ).rejects.toThrow(/payments_settlement_complete/)
    await expect(
      asMember(MEMBER_A, () => q('UPDATE payments SET settled_amount = NULL WHERE id = $1', [PAY_PART])),
    ).rejects.toThrow(/payments_settlement_complete/)
  })
})

// The shapes app/o/[slug]/payments/actions.ts writes: settle and correct both
// set all four settlement columns, clear nulls three.
const SETTLE = `UPDATE payments SET settled_amount = 8000, settled_date = '${TODAY}', method = 'cash', note = 'settled'`
const CORRECT = `UPDATE payments SET settled_amount = 1, settled_date = '2026-01-01', method = 'other', note = 'corrected'`
const CLEAR = `UPDATE payments SET settled_amount = NULL, settled_date = NULL, method = NULL`

describe('settling across Orgs', () => {
  it.runIf(reachable)('lets Org A’s Member settle, correct and clear Org A’s Payment', async () => {
    // So the refusals below are RLS, not a statement that matches nothing.
    for (const sql of [SETTLE, CORRECT, CLEAR]) {
      const res = await asMember(MEMBER_A, () => q(`${sql} WHERE id = $1 AND org_id = $2`, [PAY_PART, ORG_A]))
      expect(res.rowCount).toBe(1)
    }
  })

  it.runIf(reachable)('refuses Org B’s Member settling, correcting or clearing Org A’s Payment, and changes nothing', async () => {
    // The action's own filter (id and org_id) and the bare id, which is what a
    // hand-built request would try: RLS's USING hides the row from both.
    const before = await footprint()
    for (const sql of [SETTLE, CORRECT, CLEAR]) {
      for (const payment of [PAY_PART, PAY_OPEN, PAY_REFUND]) {
        expect((await committedAs(MEMBER_B, `${sql} WHERE id = $1 AND org_id = $2`, [payment, ORG_A])).rowCount).toBe(0)
        expect((await committedAs(MEMBER_B, `${sql} WHERE id = $1`, [payment])).rowCount).toBe(0)
      }
    }
    expect(await footprint()).toEqual(before)
  })

  it.runIf(reachable)('refuses Org B’s Member moving its own Payment into Org A', async () => {
    // WITH CHECK, not USING: the row is B's and visible, the new org_id is not.
    const before = await footprint()
    await expect(
      committedAs(MEMBER_B, 'UPDATE payments SET org_id = $2 WHERE id = $1', [PAY_B, ORG_A]),
    ).rejects.toThrow(/row-level security/i)
    expect(await footprint()).toEqual(before)
  })
})

describe('the counts, for anyone else', () => {
  const ZERO_COUNTS = {
    overdue_count: 0,
    overdue_amount: 0,
    refunds_late_count: 0,
    refunds_late_amount: 0,
    due_soon_count: 0,
    settled_this_month_count: 0,
  }
  const ZERO_DASHBOARD = { overdue_amount: 0, overdue_count: 0, refunds_late: 0 }

  it.runIf(reachable)('gives a signed-in non-member zeros for Org A from both functions', async () => {
    expect(await countsAs(NOBODY, ORG_A)).toEqual(ZERO_COUNTS)
    expect(await dashboardAs(NOBODY, ORG_A)).toEqual(ZERO_DASHBOARD)
  })

  it.runIf(reachable)('gives Org B’s Member zeros for Org A, and Org A’s Member none of Org B’s ฿400,000', async () => {
    expect(await countsAs(MEMBER_B, ORG_A)).toEqual(ZERO_COUNTS)
    expect(await dashboardAs(MEMBER_B, ORG_A)).toEqual(ZERO_DASHBOARD)
    expect(await countsAs(MEMBER_A, ORG_B)).toEqual(ZERO_COUNTS)
  })

  it.runIf(reachable)('does not let anon execute either function', async () => {
    // Both were created fresh in 0018, and a fresh function picks up
    // Supabase's default EXECUTE for anon (0013, ADR 0006).
    const { rows } = await q(
      `SELECT f FROM unnest(ARRAY['org_dashboard(uuid,date)', 'org_payment_counts(uuid,date)']) AS f
        WHERE has_function_privilege('anon', f, 'EXECUTE')
           OR NOT has_function_privilege('authenticated', f, 'EXECUTE')`,
    )
    expect(rows).toEqual([])

    for (const fn of ['org_dashboard', 'org_payment_counts']) {
      await client.query('BEGIN')
      try {
        await client.query('SET LOCAL ROLE anon')
        await expect(client.query(`SELECT * FROM ${fn}($1, $2)`, [ORG_A, TODAY])).rejects.toThrow(/permission denied/)
      } finally {
        await client.query('ROLLBACK')
      }
    }
  })
})
