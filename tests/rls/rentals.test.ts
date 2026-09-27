/**
 * The Rental lifecycle functions (0017), called as a signed-in Member.
 *
 * create_rental, end_rental, renew_rental and delete_rental are SECURITY
 * INVOKER on purpose (ADR 0014): nothing in them checks Membership, because RLS
 * and the 0016 composite keys are meant to refuse another Org's ids at the
 * first write. That is only proven by calling them as `authenticated` — a
 * superuser bypasses RLS and would pass every case here while proving nothing.
 *
 * Two ways of calling:
 *   - `asMember` wraps the call in BEGIN/ROLLBACK and lets the test read the
 *     result inside the same transaction. For the happy paths.
 *   - `committedAs` runs the call in autocommit, one statement, one transaction
 *     — exactly how PostgREST runs an RPC. For "refused and wrote nothing" and
 *     for atomicity: inside a test's own BEGIN/ROLLBACK, "nothing persisted" is
 *     true whatever the function did, so it would prove nothing.
 *
 *   docker compose up -d && npm run db:reset && npx vitest run tests/rls/rentals.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { buildPaymentSchedule, futureUnpaid, settleThrough, type ScheduleTerms } from '@/lib/payments'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://sala:sala@localhost:54329/sala'

const ORG_A = '0a000000-0000-0000-0000-0000000000a7'
const ORG_B = '0b000000-0000-0000-0000-0000000000a7'
const MEMBER_A = 'aa000000-0000-0000-0000-0000000000a7'
const MEMBER_B = 'bb000000-0000-0000-0000-0000000000a7'

// PROP_A1 is free, and is where every create happens. PROP_A2 carries the
// Rental that end, renew and delete are tried on. PROP_A3 is let by another
// agent and ends this month; PROP_A4 is ours, active, and past its end date.
const PROP_A1 = '11000000-0000-0000-0000-0000000000a7'
const PROP_A2 = '12000000-0000-0000-0000-0000000000a7'
const PROP_A3 = '13000000-0000-0000-0000-0000000000a7'
const PROP_A4 = '14000000-0000-0000-0000-0000000000a7'
const PROP_B = '15000000-0000-0000-0000-0000000000a7'

const TENANT_A = '21000000-0000-0000-0000-0000000000a7'
const TENANT_B = '22000000-0000-0000-0000-0000000000a7'

const RENTAL_A2 = '31000000-0000-0000-0000-0000000000a7'
const RENTAL_A3 = '32000000-0000-0000-0000-0000000000a7'
const RENTAL_A4 = '33000000-0000-0000-0000-0000000000a7'
const RENTAL_A1_ENDED = '34000000-0000-0000-0000-0000000000a7'
const RENTAL_B = '35000000-0000-0000-0000-0000000000a7'

// Fixed rather than now(), for the reason dashboard.test.ts gives: the caller
// passes Bangkok's today in, and a fixed date keeps "this month" from drifting.
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

/** The JSON the Server Action hands the function (actions.ts `scheduleJson`):
 *  built by the same TypeScript, without the ids the function stamps itself. */
function scheduleJson(terms: Partial<ScheduleTerms>, opts: { depositHeld?: boolean; paidThrough?: string | null } = {}) {
  const full: ScheduleTerms = {
    id: '',
    org_id: '',
    property_id: '',
    start_date: '2026-03-01',
    end_date: '2027-02-28',
    monthly_rent: 8000,
    deposit: 16000,
    commission: 8000,
    rented_by_us: true,
    rent_tracked_by_us: true,
    ...terms,
  }
  return settleThrough(buildPaymentSchedule(full, opts), opts.paidThrough ?? null).map((p) => ({
    type: p.type,
    direction: p.direction,
    due_date: p.due_date,
    amount: p.amount,
    settled_date: p.settled_date,
    settled_amount: p.settled_amount,
  }))
}

const OURS = {
  start_date: '2026-03-01',
  end_date: '2027-02-28',
  monthly_rent: 8000,
  deposit: 16000,
  commission: 8000,
  rented_by_us: true,
  rent_tracked_by_us: true,
}

const ELSEWHERE = {
  start_date: TODAY,
  end_date: '2027-09-26',
  monthly_rent: 0,
  deposit: 0,
  commission: 0,
  rented_by_us: false,
  rent_tracked_by_us: false,
}

const CREATE_SQL = `SELECT create_rental($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb) AS id`
const createArgs = (
  org: string,
  property: string,
  tenantId: string | null,
  newTenant: object | null,
  rental: object,
  schedule: object[],
) => [org, property, tenantId, newTenant && JSON.stringify(newTenant), JSON.stringify(rental), JSON.stringify(schedule)]

/** Everything a stray write could touch, in both Orgs, read as the superuser. */
async function footprint() {
  const { rows } = await q(
    `SELECT
       (SELECT count(*) FROM tenants  WHERE org_id = ANY($1))::int AS tenants,
       (SELECT count(*) FROM rentals  WHERE org_id = ANY($1))::int AS rentals,
       (SELECT count(*) FROM payments WHERE org_id = ANY($1))::int AS payments,
       (SELECT string_agg(id || '=' || status, ',' ORDER BY id) FROM properties WHERE org_id = ANY($1)) AS statuses`,
    [[ORG_A, ORG_B]],
  )
  return rows[0]
}

beforeAll(async () => {
  if (!reachable) return
  await q('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await q(`INSERT INTO orgs (id, slug, name) VALUES ($1,'rent-a','Rent A'), ($2,'rent-b','Rent B')`, [ORG_A, ORG_B])
  await q(
    `INSERT INTO memberships (org_id, user_id, role) VALUES ($1,$2,'member'), ($3,$4,'member')`,
    [ORG_A, MEMBER_A, ORG_B, MEMBER_B],
  )
  await q(
    `INSERT INTO properties (id, org_id, title, price_monthly, property_type, status) VALUES
       ($1,$6,'A free',8000,'condo','available'),
       ($2,$6,'A let',8000,'condo','rented'),
       ($3,$6,'A elsewhere',8000,'condo','rented'),
       ($4,$6,'A overdue end',8000,'condo','rented'),
       ($5,$7,'B let',8000,'condo','rented')`,
    [PROP_A1, PROP_A2, PROP_A3, PROP_A4, PROP_B, ORG_A, ORG_B],
  )
  await q(
    `INSERT INTO tenants (id, org_id, name, phone) VALUES ($1,$2,'Tenant A','0811111111'), ($3,$4,'Tenant B','0822222222')`,
    [TENANT_A, ORG_A, TENANT_B, ORG_B],
  )
  await q(
    `INSERT INTO rentals (id, org_id, property_id, tenant_id, tenant_name_snapshot, tenant_phone_snapshot,
                          start_date, end_date, monthly_rent, deposit, commission,
                          rented_by_us, rent_tracked_by_us, status) VALUES
       ($1,$6,$7, $8,  'Tenant A','0811111111', '2026-03-01','2027-02-28', 8000,16000,8000, true, true, 'active'),
       ($2,$6,$9, NULL,'Let by another agent',NULL, '2025-10-01','2026-09-30', 0,0,0, false,false,'active'),
       ($3,$6,$10,$8,  'Tenant A','0811111111', '2025-09-01','2026-08-31', 8000,0,0, true, false,'active'),
       ($4,$6,$11,$8,  'Tenant A','0811111111', '2025-03-01','2026-02-28', 8000,0,0, true, true, 'ended'),
       ($5,$12,$13,$14,'Tenant B','0822222222', '2026-03-01','2027-02-28', 8000,0,0, true, true, 'active')`,
    [RENTAL_A2, RENTAL_A3, RENTAL_A4, RENTAL_A1_ENDED, RENTAL_B, ORG_A, PROP_A2, TENANT_A, PROP_A3, PROP_A4, PROP_A1, ORG_B, PROP_B, TENANT_B],
  )
  // RENTAL_A2's schedule: Deposit and Commission settled, rent settled March to
  // June, and January 2027 paid ahead — a settled row due after any end date
  // tried below, which ending must still leave alone.
  await q(
    `INSERT INTO payments (org_id, rental_id, property_id, type, due_date, amount, settled_date, settled_amount)
     SELECT $1::uuid, $2::uuid, $3::uuid, 'rent'::payment_type, d::date, 8000,
            CASE WHEN d < '2026-07-01' OR d = '2027-01-01' THEN '2026-06-01'::date END,
            CASE WHEN d < '2026-07-01' OR d = '2027-01-01' THEN 8000 END
       FROM generate_series('2026-03-01'::date, '2027-02-01'::date, interval '1 month') d
     UNION ALL SELECT $1, $2, $3, 'deposit',    '2026-03-01', 16000, '2026-03-01', 16000
     UNION ALL SELECT $1, $2, $3, 'commission', '2026-03-01',  8000, '2026-03-01',  8000`,
    [ORG_A, RENTAL_A2, PROP_A2],
  )
})

afterAll(async () => {
  if (!reachable) return
  await q('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await client.end()
})

describe('create_rental', () => {
  it('has a database to inspect', () => {
    expect(reachable, `Cannot reach ${DATABASE_URL}. Run: docker compose up -d && npm run db:reset`).toBe(true)
  })

  it.runIf(reachable)('writes the Tenant, the Rental, its schedule and the status in one call', async () => {
    await asMember(MEMBER_A, async () => {
      const schedule = scheduleJson({}, { paidThrough: '2026-08-01' })
      const { rows } = await q(
        CREATE_SQL,
        createArgs(ORG_A, PROP_A1, null, { name: ' Somchai ', phone: '0812345678', line_id: '', note: null }, OURS, schedule),
      )
      const id = rows[0].id

      const rental = (await q(
        `SELECT r.tenant_name_snapshot, r.tenant_phone_snapshot, t.name, t.line_id, r.status::text
           FROM rentals r JOIN tenants t ON t.id = r.tenant_id WHERE r.id = $1`,
        [id],
      )).rows[0]
      // Snapshot from the row the function wrote, trimmed — not the raw form value.
      expect(rental).toEqual({
        tenant_name_snapshot: 'Somchai',
        tenant_phone_snapshot: '0812345678',
        name: 'Somchai',
        line_id: null,
        status: 'active',
      })

      const pay = (await q(
        `SELECT count(*)::int AS n, count(settled_date)::int AS settled,
                bool_and(org_id = $2 AND property_id = $3) AS stamped
           FROM payments WHERE rental_id = $1`,
        [id, ORG_A, PROP_A1],
      )).rows[0]
      // 12 rent + Deposit + Commission; Paid through 1 Aug settles March to
      // August rent plus the two start-date rows.
      expect(pay).toEqual({ n: 14, settled: 8, stamped: true })

      expect((await q('SELECT status::text FROM properties WHERE id = $1', [PROP_A1])).rows[0].status).toBe('rented')
    })
  })

  it.runIf(reachable)('snapshots an existing Tenant from the row, not the form', async () => {
    await asMember(MEMBER_A, async () => {
      const { rows } = await q(CREATE_SQL, createArgs(ORG_A, PROP_A1, TENANT_A, null, OURS, []))
      const r = (await q('SELECT tenant_id, tenant_name_snapshot, tenant_phone_snapshot FROM rentals WHERE id = $1', [rows[0].id])).rows[0]
      expect(r).toEqual({ tenant_id: TENANT_A, tenant_name_snapshot: 'Tenant A', tenant_phone_snapshot: '0811111111' })
    })
  })

  it.runIf(reachable)('records a room let by another agent with no Tenant and no Payments', async () => {
    await asMember(MEMBER_A, async () => {
      const { rows } = await q(CREATE_SQL, createArgs(ORG_A, PROP_A1, null, null, ELSEWHERE, scheduleJson(ELSEWHERE)))
      const r = (await q(
        `SELECT tenant_id, tenant_name_snapshot, (SELECT count(*)::int FROM payments WHERE rental_id = $1) AS payments
           FROM rentals WHERE id = $1`,
        [rows[0].id],
      )).rows[0]
      expect(r).toEqual({ tenant_id: null, tenant_name_snapshot: 'Let by another agent', payments: 0 })
      expect((await q('SELECT status::text FROM properties WHERE id = $1', [PROP_A1])).rows[0].status).toBe('rented')
    })
  })

  it.runIf(reachable)('refuses a Rental of ours with no Tenant', async () => {
    await expect(
      asMember(MEMBER_A, () => q(CREATE_SQL, createArgs(ORG_A, PROP_A1, null, null, OURS, []))),
    ).rejects.toThrow(/needs a Tenant/)
  })

  it.runIf(reachable)('refuses a second active Rental on one Property', async () => {
    // rentals_one_active_per_property (0001). The action matches on the index
    // name and code to say "This Property already has an active Rental."
    await expect(
      asMember(MEMBER_A, () => q(CREATE_SQL, createArgs(ORG_A, PROP_A2, TENANT_A, null, OURS, []))),
    ).rejects.toMatchObject({ code: '23505', message: expect.stringContaining('rentals_one_active_per_property') })
  })
})

describe('create_rental across Orgs', () => {
  // The case that matters: a real, signed-in Member of Org B, naming Org A.
  // Each call commits on its own, like an RPC, so "writes nothing" is checked
  // against what actually persisted.
  it.runIf(reachable)('refuses Org B’s Member creating a Rental for Org A, and writes nothing', async () => {
    const before = await footprint()

    await expect(
      committedAs(MEMBER_B, CREATE_SQL, createArgs(ORG_A, PROP_A1, null, { name: 'Intruder' }, OURS, scheduleJson({}))),
    ).rejects.toThrow(/row-level security/i)

    // No Tenant to write first, so the Rental insert is the one RLS meets.
    await expect(
      committedAs(MEMBER_B, CREATE_SQL, createArgs(ORG_A, PROP_A1, null, null, ELSEWHERE, [])),
    ).rejects.toThrow(/row-level security/i)

    // Org A's Tenant is invisible to Org B's Member, so it reads as not found.
    await expect(
      committedAs(MEMBER_B, CREATE_SQL, createArgs(ORG_A, PROP_A1, TENANT_A, null, OURS, [])),
    ).rejects.toMatchObject({ code: 'P0002' })

    expect(await footprint()).toEqual(before)
  })

  it.runIf(reachable)('refuses Org B’s Member naming Org A’s Property under Org B’s own id', async () => {
    // RLS admits org_id = B. It is the 0016 composite key that refuses
    // (PROP_A1, B), and the Tenant already written in B goes with it.
    const before = await footprint()
    await expect(
      committedAs(MEMBER_B, CREATE_SQL, createArgs(ORG_B, PROP_A1, null, { name: 'Smuggled' }, OURS, scheduleJson({}))),
    ).rejects.toThrow(/rentals_property_id_fkey/)
    await expect(
      committedAs(MEMBER_B, CREATE_SQL, createArgs(ORG_B, PROP_B, TENANT_A, null, OURS, [])),
    ).rejects.toMatchObject({ code: 'P0002' })
    expect(await footprint()).toEqual(before)
  })
})

describe('create_rental is atomic', () => {
  it.runIf(reachable)('rolls back the Tenant, the Rental and the status when a schedule row is refused', async () => {
    // A valid row first, then one the `amount > 0` CHECK refuses. The Tenant
    // and the Rental are already written by the time it fails. The status
    // update comes after the schedule, so for it this proves only that the
    // function stopped — it is asserted anyway, because a reorder of the body
    // must not make it true.
    const before = await footprint()
    const schedule = [
      { type: 'deposit', direction: 'in', due_date: '2026-03-01', amount: 16000, settled_date: null, settled_amount: null },
      { type: 'rent', direction: 'in', due_date: '2026-03-01', amount: 0, settled_date: null, settled_amount: null },
    ]
    await expect(
      committedAs(MEMBER_A, CREATE_SQL, createArgs(ORG_A, PROP_A1, null, { name: 'Atomic a7' }, OURS, schedule)),
    ).rejects.toThrow(/payments_amount_check/)

    expect(await footprint()).toEqual(before)
    expect((await q(`SELECT count(*)::int AS n FROM tenants WHERE name = 'Atomic a7'`)).rows[0].n).toBe(0)
    expect((await q('SELECT count(*)::int AS n FROM rentals WHERE property_id = $1 AND status = $2', [PROP_A1, 'active'])).rows[0].n).toBe(0)
    expect((await q('SELECT status::text FROM properties WHERE id = $1', [PROP_A1])).rows[0].status).toBe('available')
  })
})

describe('end_rental', () => {
  it.runIf(reachable)('deletes exactly the unsettled rows after the day, adds the refund, frees the room', async () => {
    await asMember(MEMBER_A, async () => {
      const before = (await q(
        `SELECT id, due_date::text, settled_date::text FROM payments WHERE rental_id = $1`,
        [RENTAL_A2],
      )).rows
      // The same predicate the confirmation counts with, so the number shown
      // is the number that goes.
      const expected = futureUnpaid(before, '2026-10-01').map((p) => p.id).sort()
      // Nov, Dec, Feb. 1 Oct is the end day itself and stays; Jan is settled.
      expect(expected).toHaveLength(3)

      const { rows } = await q(`SELECT end_rental($1, $2, $3, $4, $5, $6) AS n`, [
        ORG_A, RENTAL_A2, '2026-10-01', '  moved out  ', 12000, '2026-10-31',
      ])
      expect(rows[0].n).toBe(3)

      const after = (await q(
        `SELECT id, type::text, direction::text, due_date::text, amount::float AS amount, settled_date
           FROM payments WHERE rental_id = $1`,
        [RENTAL_A2],
      )).rows
      const gone = before.map((p) => p.id).filter((id) => !after.some((a) => a.id === id)).sort()
      expect(gone).toEqual(expected)
      expect(after.filter((p) => p.settled_date !== null)).toHaveLength(before.filter((p) => p.settled_date !== null).length)
      expect(after.filter((p) => p.type === 'deposit_refund')).toEqual([
        expect.objectContaining({ direction: 'out', due_date: '2026-10-31', amount: 12000, settled_date: null }),
      ])

      const r = (await q(
        `SELECT status::text, ended_reason, (ended_at AT TIME ZONE 'Asia/Bangkok')::date::text AS ended_on
           FROM rentals WHERE id = $1`,
        [RENTAL_A2],
      )).rows[0]
      expect(r).toEqual({ status: 'ended', ended_reason: 'moved out', ended_on: '2026-10-01' })
      expect((await q('SELECT status::text FROM properties WHERE id = $1', [PROP_A2])).rows[0].status).toBe('available')
    })
  })

  it.runIf(reachable)('writes no refund when it is 0', async () => {
    await asMember(MEMBER_A, async () => {
      await q(`SELECT end_rental($1, $2, $3, NULL, 0, NULL)`, [ORG_A, RENTAL_A2, '2026-10-01'])
      const { rows } = await q(`SELECT count(*)::int AS n FROM payments WHERE rental_id = $1 AND type = 'deposit_refund'`, [RENTAL_A2])
      expect(rows[0].n).toBe(0)
    })
  })

  it.runIf(reachable)('refuses a Rental that is not active', async () => {
    await expect(
      asMember(MEMBER_A, () => q(`SELECT end_rental($1, $2, $3, NULL, 0, NULL)`, [ORG_A, RENTAL_A1_ENDED, '2026-10-01'])),
    ).rejects.toMatchObject({ code: 'P0002' })
  })

  it.runIf(reachable)('refuses Org B’s Member ending Org A’s Rental, and changes nothing', async () => {
    const before = await footprint()
    await expect(
      committedAs(MEMBER_B, `SELECT end_rental($1, $2, $3, NULL, 0, NULL)`, [ORG_A, RENTAL_A2, '2026-10-01']),
    ).rejects.toMatchObject({ code: 'P0002' })
    expect(await footprint()).toEqual(before)
    expect((await q('SELECT status::text FROM rentals WHERE id = $1', [RENTAL_A2])).rows[0].status).toBe('active')
  })
})

describe('renew_rental', () => {
  const NEXT = { end_date: '2028-02-29', monthly_rent: 8500, commission: 8500 }
  const nextSchedule = scheduleJson(
    { start_date: '2027-03-01', end_date: '2028-02-29', monthly_rent: 8500, commission: 8500 },
    { depositHeld: true },
  )

  it.runIf(reachable)('leaves one active Rental from the next day, billed a Commission and no Deposit', async () => {
    await asMember(MEMBER_A, async () => {
      const before = (await q('SELECT count(*)::int AS n FROM payments WHERE rental_id = $1', [RENTAL_A2])).rows[0].n
      const { rows } = await q(`SELECT renew_rental($1, $2, $3::jsonb, $4::jsonb) AS id`, [
        ORG_A, RENTAL_A2, JSON.stringify(NEXT), JSON.stringify(nextSchedule),
      ])
      const next = rows[0].id

      const active = (await q(
        `SELECT id, start_date::text, end_date::text, tenant_id, tenant_name_snapshot,
                monthly_rent::float AS rent, deposit::float AS deposit, commission::float AS commission
           FROM rentals WHERE property_id = $1 AND status = 'active'`,
        [PROP_A2],
      )).rows
      expect(active).toEqual([
        {
          id: next,
          start_date: '2027-03-01',
          end_date: '2028-02-29',
          tenant_id: TENANT_A,
          tenant_name_snapshot: 'Tenant A',
          rent: 8500,
          // Carried for reference; the money itself is still with the Owner.
          deposit: 16000,
          commission: 8500,
        },
      ])

      const types = (await q(
        `SELECT type::text, count(*)::int AS n, sum(amount)::float AS total FROM payments
          WHERE rental_id = $1 GROUP BY type ORDER BY type`,
        [next],
      )).rows
      expect(types).toEqual([
        { type: 'commission', n: 1, total: 8500 },
        { type: 'rent', n: 12, total: 102000 },
      ])

      const old = (await q(
        `SELECT status::text, ended_reason, (ended_at AT TIME ZONE 'Asia/Bangkok')::date::text AS ended_on
           FROM rentals WHERE id = $1`,
        [RENTAL_A2],
      )).rows[0]
      expect(old).toEqual({ status: 'ended', ended_reason: 'Renewed', ended_on: '2027-02-28' })
      // Nothing is due after the old end date, so nothing under it goes, and
      // there is no Deposit Refund.
      expect((await q('SELECT count(*)::int AS n FROM payments WHERE rental_id = $1', [RENTAL_A2])).rows[0].n).toBe(before)
      expect((await q('SELECT status::text FROM properties WHERE id = $1', [PROP_A2])).rows[0].status).toBe('rented')
    })
  })

  it.runIf(reachable)('refuses a Rental that is not active', async () => {
    await expect(
      asMember(MEMBER_A, () =>
        q(`SELECT renew_rental($1, $2, $3::jsonb, '[]'::jsonb)`, [ORG_A, RENTAL_A1_ENDED, JSON.stringify(NEXT)]),
      ),
    ).rejects.toMatchObject({ code: 'P0002' })
  })

  it.runIf(reachable)('refuses Org B’s Member renewing Org A’s Rental', async () => {
    const before = await footprint()
    await expect(
      committedAs(MEMBER_B, `SELECT renew_rental($1, $2, $3::jsonb, '[]'::jsonb)`, [ORG_A, RENTAL_A2, JSON.stringify(NEXT)]),
    ).rejects.toMatchObject({ code: 'P0002' })
    expect(await footprint()).toEqual(before)
  })
})

describe('delete_rental', () => {
  it.runIf(reachable)('refuses a Rental with a settled Payment', async () => {
    await expect(
      asMember(MEMBER_A, () => q('SELECT delete_rental($1, $2)', [ORG_A, RENTAL_A2])),
    ).rejects.toMatchObject({ code: 'SL001' })
  })

  it.runIf(reachable)('refuses a Rental with a Rental Document, even with nothing settled', async () => {
    await expect(
      asMember(MEMBER_A, async () => {
        const { rows } = await q(CREATE_SQL, createArgs(ORG_A, PROP_A1, TENANT_A, null, OURS, scheduleJson({})))
        await q(
          `INSERT INTO rental_documents (org_id, rental_id, storage_path, file_name, mime_type, size_bytes)
           VALUES ($1, $2, $3, 'contract.pdf', 'application/pdf', 1024)`,
          [ORG_A, rows[0].id, `${ORG_A}/rentals/${rows[0].id}/x.pdf`],
        )
        return q('SELECT delete_rental($1, $2)', [ORG_A, rows[0].id])
      }),
    ).rejects.toMatchObject({ code: 'SL002' })
  })

  it.runIf(reachable)('otherwise deletes it with every Payment, and frees the room', async () => {
    await asMember(MEMBER_A, async () => {
      const { rows } = await q(CREATE_SQL, createArgs(ORG_A, PROP_A1, TENANT_A, null, OURS, scheduleJson({})))
      const id = rows[0].id
      expect((await q('SELECT count(*)::int AS n FROM payments WHERE rental_id = $1', [id])).rows[0].n).toBe(14)

      const del = await q('SELECT delete_rental($1, $2) AS property', [ORG_A, id])
      expect(del.rows[0].property).toBe(PROP_A1)
      expect((await q('SELECT count(*)::int AS n FROM rentals WHERE id = $1', [id])).rows[0].n).toBe(0)
      expect((await q('SELECT count(*)::int AS n FROM payments WHERE rental_id = $1', [id])).rows[0].n).toBe(0)
      expect((await q('SELECT status::text FROM properties WHERE id = $1', [PROP_A1])).rows[0].status).toBe('available')
    })
  })

  it.runIf(reachable)('refuses Org B’s Member deleting Org A’s Rental', async () => {
    // RENTAL_A3 has no Payment and no Document, so only RLS stands between
    // Org B and the DELETE: invisible, so not found.
    const before = await footprint()
    await expect(committedAs(MEMBER_B, 'SELECT delete_rental($1, $2)', [ORG_A, RENTAL_A3])).rejects.toMatchObject({
      code: 'P0002',
    })
    expect(await footprint()).toEqual(before)
  })
})

describe('the counts', () => {
  const countsAs = (who: string, org: string) =>
    asMember(who, async () => (await q('SELECT * FROM org_rental_counts($1, $2)', [org, TODAY])).rows[0])

  const dashboardAs = (who: string, org: string) =>
    asMember(who, async () => {
      const r = (await q('SELECT * FROM org_dashboard($1, $2)', [org, TODAY])).rows[0]
      return { rentals_active: r.rentals_active, rentals_ending_this_month: r.rentals_ending_this_month }
    })

  it.runIf(reachable)('org_rental_counts leaves let-elsewhere out of Active and in Ending this month', async () => {
    // Active: A2 and A4 (ours). Let elsewhere: A3, which ends 30 Sep — the
    // only one ending this month. A4 ended its term on 31 Aug with no expiry
    // job to close it (ADR 0012).
    expect(await countsAs(MEMBER_A, ORG_A)).toEqual({
      active: 2,
      let_elsewhere: 1,
      ending_this_month: 1,
      past_end_date: 1,
      ended: 1,
    })
  })

  it.runIf(reachable)('org_dashboard agrees on Active and Ending this month', async () => {
    expect(await dashboardAs(MEMBER_A, ORG_A)).toEqual({ rentals_active: 2, rentals_ending_this_month: 1 })
  })

  it.runIf(reachable)('gives Org B’s Member zeros for Org A', async () => {
    expect(await countsAs(MEMBER_B, ORG_A)).toEqual({
      active: 0,
      let_elsewhere: 0,
      ending_this_month: 0,
      past_end_date: 0,
      ended: 0,
    })
    expect(await dashboardAs(MEMBER_B, ORG_A)).toEqual({ rentals_active: 0, rentals_ending_this_month: 0 })
  })

  it.runIf(reachable)('does not let anon execute any of the new functions', async () => {
    // schema-shape.test.ts checks this over every function; named here so a
    // failure points at 0017 rather than at a list.
    const { rows } = await q(
      `SELECT f FROM unnest(ARRAY[
         'create_rental(uuid,uuid,uuid,jsonb,jsonb,jsonb)',
         'end_rental(uuid,uuid,date,text,numeric,date)',
         'renew_rental(uuid,uuid,jsonb,jsonb)',
         'delete_rental(uuid,uuid)',
         'org_rental_counts(uuid,date)',
         'org_dashboard(uuid,date)'
       ]) AS f
       WHERE has_function_privilege('anon', f, 'EXECUTE')
          OR NOT has_function_privilege('authenticated', f, 'EXECUTE')`,
    )
    expect(rows).toEqual([])
  })
})
