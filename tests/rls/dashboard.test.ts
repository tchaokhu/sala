/**
 * The dashboard aggregate, proven against a real database.
 *
 * `org_dashboard()` is the whole of the Org landing page's numbers in one
 * round-trip: counts and a sum computed in Postgres rather than by downloading
 * the tables and reducing over them in JavaScript (CLAUDE.md). Two things need
 * proving, and neither can be shown without a database:
 *
 *   1. the arithmetic — what counts as active, as ending this month, as overdue
 *   2. the isolation — the function is SECURITY INVOKER, so RLS filters every
 *      one of its subqueries. A non-member naming a real Org's id gets zeros,
 *      not another agency's books.
 *
 *   docker compose up -d && npm run db:reset && npx vitest run tests/rls/dashboard.test.ts
 *
 * Like the other tests here it connects at module scope and skips (outside CI)
 * when the database is unreachable, rather than failing for an absent Postgres.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://sala:sala@localhost:54329/sala'

// Fixed ids so the assertions can name them. Org A is the one under test; Org B
// is noise deliberately shaped to inflate every tile if isolation ever breaks.
const ORG_A = '0a000000-0000-0000-0000-0000000000d1'
const ORG_B = '0b000000-0000-0000-0000-0000000000d1'
const USER_A = 'aa000000-0000-0000-0000-0000000000d1'
const USER_B = 'bb000000-0000-0000-0000-0000000000d1'

// "Today" is passed in rather than read from now(): the caller anchors it to
// Asia/Bangkok (CLAUDE.md), and a fixed date keeps these assertions from
// changing meaning as the month turns.
const TODAY = '2026-07-28'

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

interface Dashboard {
  properties_total: number
  rentals_active: number
  rentals_ending_this_month: number
  overdue_amount: number
  overdue_count: number
  refunds_late: number
}

/** The exact call a Server Component makes, run as `who`. Wrapped in a
 *  transaction so the role switch and the JWT claim are scoped with SET LOCAL
 *  and never leak into the next case. numeric arrives from `pg` as a string;
 *  PostgREST would hand the app a JSON number, so coerce here and compare
 *  numbers either way. */
async function dashboardAs(who: string | null, org: string, today = TODAY): Promise<Dashboard> {
  await client.query('BEGIN')
  try {
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [who ?? ''])
    await client.query('SET LOCAL ROLE authenticated')
    const { rows } = await client.query('SELECT * FROM org_dashboard($1, $2)', [org, today])
    const row = rows[0]
    return {
      properties_total: Number(row.properties_total),
      rentals_active: Number(row.rentals_active),
      rentals_ending_this_month: Number(row.rentals_ending_this_month),
      overdue_amount: Number(row.overdue_amount),
      overdue_count: Number(row.overdue_count),
      refunds_late: Number(row.refunds_late),
    }
  } finally {
    await client.query('ROLLBACK')
  }
}

/** Seeded as the superuser, which bypasses RLS — the point under test is the
 *  read, not the seed. */
async function seedOrg(org: string, slug: string, opts: { properties: number }) {
  await client.query(`INSERT INTO orgs (id, slug, name) VALUES ($1, $2, $2)`, [org, slug])
  const propertyIds: string[] = []
  for (let i = 0; i < opts.properties; i++) {
    const { rows } = await client.query(
      `INSERT INTO properties (org_id, title, price_monthly, property_type)
       VALUES ($1, $2, 20000, 'condo') RETURNING id`,
      [org, `${slug} unit ${i + 1}`],
    )
    propertyIds.push(rows[0].id)
  }
  return propertyIds
}

async function addRental(
  org: string,
  propertyId: string,
  endDate: string,
  status: 'active' | 'ended' | 'cancelled' = 'active',
) {
  // rented_by_us, because both flags off is a Rental let by another agent,
  // which Active Rentals leaves out (0017).
  const { rows } = await client.query(
    `INSERT INTO rentals (org_id, property_id, tenant_name_snapshot, start_date, end_date,
                          monthly_rent, status, rented_by_us)
     VALUES ($1, $2, 'ผู้เช่า', '2025-08-01', $3, 20000, $4, true) RETURNING id`,
    [org, propertyId, endDate, status],
  )
  return rows[0].id as string
}

async function addPayment(
  org: string,
  rentalId: string,
  propertyId: string,
  p: {
    dueDate: string
    amount: number
    settledDate?: string
    direction?: 'in' | 'out'
    type?: 'rent' | 'deposit' | 'commission' | 'deposit_refund' | 'other'
  },
) {
  await client.query(
    `INSERT INTO payments (org_id, rental_id, property_id, direction, type, due_date, amount,
                           settled_date, settled_amount)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      org,
      rentalId,
      propertyId,
      p.direction ?? 'in',
      p.type ?? 'rent',
      p.dueDate,
      p.amount,
      p.settledDate ?? null,
      p.settledDate ? p.amount : null,
    ],
  )
}

beforeAll(async () => {
  if (!reachable) return
  await client.query('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])

  // ── Org A: three Properties, two active Rentals, one already ended ─────────
  const a = await seedOrg(ORG_A, 'dash-a', { properties: 3 })
  // Ends on the last day of July — inside the month, and the boundary that a
  // naive `end_date < today + 30 days` would get wrong.
  const endingThisMonth = await addRental(ORG_A, a[0], '2026-07-31')
  // Ends the very next day, in August: active, but not this month's problem.
  const endingNextMonth = await addRental(ORG_A, a[1], '2026-08-01')
  // An ended Rental still owns its rows; it must not count as active.
  const ended = await addRental(ORG_A, a[2], '2026-06-30', 'ended')

  // ── Org A money: 1000 + 2500 overdue, everything else excluded ─────────────
  await addPayment(ORG_A, endingThisMonth, a[0], { dueDate: '2026-07-01', amount: 1000 })
  await addPayment(ORG_A, endingNextMonth, a[1], { dueDate: '2026-06-01', amount: 2500 })
  // Due later this month — expected, not yet late.
  await addPayment(ORG_A, endingThisMonth, a[0], { dueDate: '2026-07-31', amount: 9999 })
  // Overdue on paper but settled, so nobody owes it.
  await addPayment(ORG_A, endingNextMonth, a[1], {
    dueDate: '2026-05-01', amount: 7777, settledDate: '2026-05-02',
  })
  // Money the Org owes outward. "ค้างชำระ" is rent not collected, not a refund
  // not yet paid out; mixing the directions makes the number meaningless.
  await addPayment(ORG_A, ended, a[2], {
    dueDate: '2026-07-01', amount: 5555, direction: 'out', type: 'deposit_refund',
  })

  // ── Org B: the same shapes, larger, and none of it is Org A's business ─────
  const b = await seedOrg(ORG_B, 'dash-b', { properties: 5 })
  const bRental = await addRental(ORG_B, b[0], '2026-07-15')
  await addRental(ORG_B, b[1], '2026-07-20')
  await addPayment(ORG_B, bRental, b[0], { dueDate: '2026-01-01', amount: 400000 })

  // USER_A belongs to Org A and nothing else. USER_B belongs to nothing.
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

describe('org_dashboard', () => {
  it('has a database to inspect', () => {
    expect(
      reachable,
      `Cannot reach ${DATABASE_URL}. Run: docker compose up -d && npm run db:reset`,
    ).toBe(true)
  })

  it.runIf(reachable)('counts the tiles a Member came for', async () => {
    expect(await dashboardAs(USER_A, ORG_A)).toEqual({
      properties_total: 3,
      rentals_active: 2,
      rentals_ending_this_month: 1,
      overdue_amount: 3500,
      overdue_count: 2,
      // The 5555 Deposit Refund: late, and counted here rather than in the sum.
      refunds_late: 1,
    })
  })

  // The isolation guarantee, on the aggregate rather than the row read: Org B
  // has more of everything, and a member of Org A sees none of it. A SECURITY
  // DEFINER function here would return Org B's numbers to anyone who asked.
  it.runIf(reachable)('gives a non-member zeros for a real Org', async () => {
    expect(await dashboardAs(USER_B, ORG_A)).toEqual({
      properties_total: 0,
      rentals_active: 0,
      rentals_ending_this_month: 0,
      overdue_amount: 0,
      overdue_count: 0,
      refunds_late: 0,
    })
  })

  it.runIf(reachable)('gives a caller with no session zeros', async () => {
    expect(await dashboardAs(null, ORG_A)).toEqual({
      properties_total: 0,
      rentals_active: 0,
      rentals_ending_this_month: 0,
      overdue_amount: 0,
      overdue_count: 0,
      refunds_late: 0,
    })
  })

  // Membership in one Org is not a key to another. USER_A is a member of A only.
  it.runIf(reachable)("refuses a Member another Org's numbers", async () => {
    expect(await dashboardAs(USER_A, ORG_B)).toEqual({
      properties_total: 0,
      rentals_active: 0,
      rentals_ending_this_month: 0,
      overdue_amount: 0,
      overdue_count: 0,
      refunds_late: 0,
    })
  })

  // "This month" is the calendar month of the date handed in, not a rolling
  // window — so the answer changes at midnight on the 1st, not gradually.
  it.runIf(reachable)('moves the ending-this-month count when the month turns', async () => {
    const august = await dashboardAs(USER_A, ORG_A, '2026-08-15')
    expect(august.rentals_ending_this_month).toBe(1) // the Aug 1 Rental, now
    expect(august.rentals_active).toBe(2)            // both still active
  })

  // Nothing overdue before anything is late: on the 1st of July only the June
  // Payment has passed its due date.
  it.runIf(reachable)('counts a Payment as overdue only once its due date has passed', async () => {
    const julyFirst = await dashboardAs(USER_A, ORG_A, '2026-07-01')
    expect(julyFirst.overdue_amount).toBe(2500)
    expect(julyFirst.overdue_count).toBe(1)
  })
})
