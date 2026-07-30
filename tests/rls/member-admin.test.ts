/**
 * Display Names and the Superadmin console's reads, proven against a real
 * database.
 *
 * 0006 adds five functions and every one of them is SECURITY DEFINER, which
 * means RLS is not doing the filtering — the function body is. That is exactly
 * the shape ADR 0005 refused for the dashboard, taken here only because
 * `auth.users` is not reachable any other way, so the guards have to be shown
 * working rather than assumed:
 *
 *   1. `org_members` admits a Member and gives a non-member nothing.
 *   2. `set_my_display_name` writes one row, one column. A member cannot use it
 *      to reach another Org, another person, or their own `role`.
 *   3. The `admin_*` functions are granted to service_role and refused to
 *      `authenticated` — a signed-in user must not be able to call the console's
 *      reads directly.
 *
 *   docker compose up -d && npm run db:reset && npx vitest run tests/rls/member-admin.test.ts
 *
 * Like the other tests here it connects at module scope and skips (outside CI)
 * when the database is unreachable, rather than failing for an absent Postgres.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://sala:sala@localhost:54329/sala'

// Fixed ids, with a suffix nothing else under tests/rls uses. The files here run
// in parallel against one database, so a shared id is not a clash in this file —
// it is another file's fixtures disappearing under it. Taken so far: a1/b1,
// c1, d1, e1, f1.
const ORG_A = '0a000000-0000-0000-0000-0000000000a2'
const ORG_B = '0b000000-0000-0000-0000-0000000000b2'
// Two Members of Org A — one owner, one plain — and one person in Org B only,
// who is the outsider every guard below is written against.
const OWNER_A = 'aa000000-0000-0000-0000-0000000000a2'
const MEMBER_A = 'aa000000-0000-0000-0000-0000000000a3'
const OWNER_B = 'bb000000-0000-0000-0000-0000000000b2'

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

type Query = <T>(sql: string, params?: unknown[]) => Promise<T[]>

/** Runs `body` as `who`, in a transaction that is always rolled back — so a
 *  write under test cannot change what the next case sees, and a write and the
 *  read that checks it still share one transaction. Statements go one at a time
 *  because a parameterised query cannot carry two. */
async function asUser<T>(
  who: string | null,
  body: (q: Query) => Promise<T>,
): Promise<T> {
  await client.query('BEGIN')
  try {
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [who ?? ''])
    await client.query('SET LOCAL ROLE authenticated')
    return await body(async (sql, params = []) => (await client.query(sql, params)).rows)
  } finally {
    await client.query('ROLLBACK')
  }
}

/** The console's own role. On Supabase it bypasses RLS; the shims give it
 *  BYPASSRLS locally so this reads the same here as it does there. */
async function asService<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  await client.query('BEGIN')
  try {
    await client.query('SET LOCAL ROLE service_role')
    const { rows } = await client.query(sql, params)
    return rows as T[]
  } finally {
    await client.query('ROLLBACK')
  }
}

/** The common case: one statement, as one caller. */
const queryAs = <T>(who: string | null, sql: string, params: unknown[] = []): Promise<T[]> =>
  asUser(who, (q) => q<T>(sql, params))

beforeAll(async () => {
  if (!reachable) return

  await client.query(`DELETE FROM memberships WHERE org_id IN ($1, $2)`, [ORG_A, ORG_B])
  await client.query(`DELETE FROM orgs WHERE id IN ($1, $2)`, [ORG_A, ORG_B])
  await client.query(`DELETE FROM auth.users WHERE id IN ($1, $2, $3)`, [
    OWNER_A, MEMBER_A, OWNER_B,
  ])

  await client.query(
    `INSERT INTO auth.users (id, email) VALUES ($1, $2), ($3, $4), ($5, $6)`,
    [
      OWNER_A, 'owner-a@example.test',
      MEMBER_A, 'Member-A@Example.test',
      OWNER_B, 'owner-b@example.test',
    ],
  )
  await client.query(`INSERT INTO orgs (id, slug, name) VALUES ($1, $2, $2), ($3, $4, $4)`, [
    ORG_A, 'member-admin-a', ORG_B, 'member-admin-b',
  ])
  await client.query(
    `INSERT INTO memberships (org_id, user_id, role, display_name) VALUES
       ($1, $2, 'owner',  'สมชาย'),
       ($1, $3, 'member', NULL),
       ($4, $5, 'owner',  'Somsri')`,
    [ORG_A, OWNER_A, MEMBER_A, ORG_B, OWNER_B],
  )
})

afterAll(async () => {
  if (!reachable) return
  await client.query(`DELETE FROM memberships WHERE org_id IN ($1, $2)`, [ORG_A, ORG_B])
  await client.query(`DELETE FROM orgs WHERE id IN ($1, $2)`, [ORG_A, ORG_B])
  await client.query(`DELETE FROM auth.users WHERE id IN ($1, $2, $3)`, [
    OWNER_A, MEMBER_A, OWNER_B,
  ])
  await client.end()
})

interface MemberRow {
  user_id: string
  email: string
  display_name: string | null
  role: string
}

describe('org_members', () => {
  it('has a database to inspect', () => {
    expect(
      reachable,
      `Cannot reach ${DATABASE_URL}. Run: docker compose up -d && npm run db:reset`,
    ).toBe(true)
  })

  it.runIf(reachable)('returns both Members to a Member of that Org', async () => {
    const rows = await queryAs<MemberRow>(OWNER_A, 'SELECT * FROM org_members($1)', [ORG_A])
    expect(rows.map(r => r.user_id).sort()).toEqual([OWNER_A, MEMBER_A].sort())
    expect(rows.find(r => r.user_id === OWNER_A)?.display_name).toBe('สมชาย')
    expect(rows.find(r => r.user_id === OWNER_A)?.email).toBe('owner-a@example.test')
  })

  it.runIf(reachable)('returns the same to a plain member — Roles do not restrict reads', async () => {
    const rows = await queryAs<MemberRow>(MEMBER_A, 'SELECT * FROM org_members($1)', [ORG_A])
    expect(rows).toHaveLength(2)
  })

  // The one that matters. The function is DEFINER, so nothing but its own WHERE
  // clause is between Org B's owner and Org A's member list.
  it.runIf(reachable)('gives a member of another Org nothing', async () => {
    const rows = await queryAs<MemberRow>(OWNER_B, 'SELECT * FROM org_members($1)', [ORG_A])
    expect(rows).toEqual([])
  })

  it.runIf(reachable)('gives an anonymous caller nothing', async () => {
    const rows = await queryAs<MemberRow>(null, 'SELECT * FROM org_members($1)', [ORG_A])
    expect(rows).toEqual([])
  })

  it.runIf(reachable)('leaves display_name null rather than inventing one', async () => {
    const rows = await queryAs<MemberRow>(MEMBER_A, 'SELECT * FROM org_members($1)', [ORG_A])
    expect(rows.find(r => r.user_id === MEMBER_A)?.display_name).toBe(null)
  })
})

/** The name on one Membership, read inside the caller's own transaction so a
 *  write and the check on it are not separated by a rollback. */
const nameOf = (q: Query, org: string, user: string) =>
  q<{ display_name: string | null }>(
    `SELECT display_name FROM memberships WHERE org_id = $1 AND user_id = $2`,
    [org, user],
  )

describe('set_my_display_name', () => {
  it.runIf(reachable)('writes the caller\'s own row', async () => {
    const name = await asUser(MEMBER_A, async (q) => {
      await q(`SELECT set_my_display_name($1, 'มานี')`, [ORG_A])
      return (await nameOf(q, ORG_A, MEMBER_A))[0].display_name
    })
    expect(name).toBe('มานี')
  })

  it.runIf(reachable)('leaves every other row alone', async () => {
    const name = await asUser(MEMBER_A, async (q) => {
      await q(`SELECT set_my_display_name($1, 'มานี')`, [ORG_A])
      return (await nameOf(q, ORG_A, OWNER_A))[0].display_name
    })
    expect(name).toBe('สมชาย')
  })

  it.runIf(reachable)('clears the name when handed blank, rather than storing whitespace', async () => {
    const name = await asUser(OWNER_A, async (q) => {
      await q(`SELECT set_my_display_name($1, '   ')`, [ORG_A])
      return (await nameOf(q, ORG_A, OWNER_A))[0].display_name
    })
    expect(name).toBe(null)
  })

  it.runIf(reachable)('trims', async () => {
    const name = await asUser(OWNER_A, async (q) => {
      await q(`SELECT set_my_display_name($1, '  มานี  ')`, [ORG_A])
      return (await nameOf(q, ORG_A, OWNER_A))[0].display_name
    })
    expect(name).toBe('มานี')
  })

  // Naming another Org is the obvious probe: the caller supplies the Org id, so
  // the function has to be the thing that refuses.
  it.runIf(reachable)('refuses an Org the caller is not in', async () => {
    await expect(
      queryAs(OWNER_B, `SELECT set_my_display_name($1, 'intruder')`, [ORG_A]),
    ).rejects.toThrow(/not a member/)

    const rows = await queryAs<{ display_name: string | null }>(
      OWNER_A,
      `SELECT display_name FROM memberships WHERE org_id = $1 AND user_id = $2`,
      [ORG_A, OWNER_A],
    )
    expect(rows[0].display_name).toBe('สมชาย')
  })

  it.runIf(reachable)('refuses an anonymous caller', async () => {
    await expect(
      queryAs(null, `SELECT set_my_display_name($1, 'anon')`, [ORG_A]),
    ).rejects.toThrow(/not a member/)
  })

  it.runIf(reachable)('refuses a name longer than the column allows', async () => {
    await expect(
      queryAs(OWNER_A, `SELECT set_my_display_name($1, repeat('ก', 81))`, [ORG_A]),
    ).rejects.toThrow(/longer than 80/)
  })
})

describe('a member cannot promote themselves', () => {
  // This is why renaming is a function and not a policy. RLS decides rows, not
  // columns: a policy letting `user_id = auth.uid()` update its own Membership
  // would have let this through, and 0006 exists in the shape it does to stop it.
  // Write and read share one transaction, so a silent no-op is visible as one.
  it.runIf(reachable)('cannot UPDATE role on their own row', async () => {
    const role = await asUser(MEMBER_A, async (q) => {
      await q(`UPDATE memberships SET role = 'owner' WHERE org_id = $1 AND user_id = $2`, [
        ORG_A, MEMBER_A,
      ])
      const rows = await q<{ role: string }>(
        `SELECT role FROM memberships WHERE org_id = $1 AND user_id = $2`,
        [ORG_A, MEMBER_A],
      )
      return rows[0].role
    })
    expect(role).toBe('member')
  })

  it.runIf(reachable)('cannot rename somebody else either', async () => {
    const name = await asUser(MEMBER_A, async (q) => {
      await q(
        `UPDATE memberships SET display_name = 'hijacked' WHERE org_id = $1 AND user_id = $2`,
        [ORG_A, OWNER_A],
      )
      return (await nameOf(q, ORG_A, OWNER_A))[0].display_name
    })
    expect(name).toBe('สมชาย')
  })

  // A second signature taking a user id would be a way around all of the above,
  // and it would look like a convenience. The only argument list this name is
  // allowed to have is the Org and the name — never a person.
  it.runIf(reachable)('offers no display-name function that takes a user id', async () => {
    const rows = await queryAs<{ args: string }>(
      MEMBER_A,
      `SELECT pg_get_function_identity_arguments(oid) AS args
         FROM pg_proc WHERE proname = 'set_my_display_name'`,
    )
    expect(rows.map(r => r.args)).toEqual(['p_org uuid, p_name text'])
  })
})

describe('the console\'s reads are the console\'s', () => {
  it.runIf(reachable)('lets service_role see any Org\'s members', async () => {
    const rows = await asService<MemberRow>('SELECT * FROM admin_org_members($1)', [ORG_A])
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.email).sort()).toEqual(
      ['Member-A@Example.test', 'owner-a@example.test'].sort(),
    )
  })

  // A signed-in user calling the console's function directly is the way this
  // would leak, and it is a grant, not a policy, that stops it.
  it.runIf(reachable)('refuses admin_org_members to a signed-in user', async () => {
    await expect(
      queryAs(OWNER_A,'SELECT * FROM admin_org_members($1)', [ORG_A]),
    ).rejects.toThrow(/permission denied/i)
  })

  it.runIf(reachable)('refuses admin_orgs to a signed-in user', async () => {
    await expect(queryAs(OWNER_A, 'SELECT * FROM admin_orgs(50)')).rejects.toThrow(
      /permission denied/i,
    )
  })

  it.runIf(reachable)('refuses admin_user_id_by_email to a signed-in user', async () => {
    await expect(
      queryAs(OWNER_A,`SELECT admin_user_id_by_email('owner-b@example.test')`),
    ).rejects.toThrow(/permission denied/i)
  })

  it.runIf(reachable)('refuses admin_owner_count to a signed-in user', async () => {
    await expect(
      queryAs(OWNER_A,'SELECT admin_owner_count($1)', [ORG_A]),
    ).rejects.toThrow(/permission denied/i)
  })
})

describe('admin_orgs', () => {
  it.runIf(reachable)('counts Members and owners per Org, in SQL', async () => {
    const rows = await asService<{
      slug: string
      member_count: number
      owner_count: number
      total: number
    }>('SELECT * FROM admin_orgs(200)')

    const a = rows.find(r => r.slug === 'member-admin-a')
    expect(a?.member_count).toBe(2)
    expect(a?.owner_count).toBe(1)

    const b = rows.find(r => r.slug === 'member-admin-b')
    expect(b?.member_count).toBe(1)
    expect(b?.owner_count).toBe(1)
  })

  it.runIf(reachable)('reports the unbounded total beside a bounded page', async () => {
    const [row] = await asService<{ total: number }>('SELECT * FROM admin_orgs(1)')
    const [{ n }] = await asService<{ n: number }>('SELECT count(*)::int AS n FROM orgs')
    expect(row.total).toBe(n)
  })

  it.runIf(reachable)('never returns more than its limit', async () => {
    const rows = await asService('SELECT * FROM admin_orgs(1)')
    expect(rows).toHaveLength(1)
  })

  // least(greatest(p_limit, 1), 200): a caller cannot ask for the whole table by
  // passing a huge number, and cannot ask for zero rows by passing junk.
  it.runIf(reachable)('clamps a nonsense limit instead of trusting it', async () => {
    expect((await asService('SELECT * FROM admin_orgs(0)')).length).toBe(1)
    expect((await asService('SELECT * FROM admin_orgs(-5)')).length).toBe(1)
  })
})

describe('admin_user_id_by_email', () => {
  it.runIf(reachable)('finds an account', async () => {
    const [row] = await asService<{ admin_user_id_by_email: string | null }>(
      `SELECT admin_user_id_by_email('owner-a@example.test')`,
    )
    expect(row.admin_user_id_by_email).toBe(OWNER_A)
  })

  // GoTrue lowercases what it stores; an operator types what was written down.
  it.runIf(reachable)('ignores case and surrounding space', async () => {
    const [row] = await asService<{ admin_user_id_by_email: string | null }>(
      `SELECT admin_user_id_by_email('  MEMBER-a@example.TEST  ')`,
    )
    expect(row.admin_user_id_by_email).toBe(MEMBER_A)
  })

  it.runIf(reachable)('returns null for an address with no account', async () => {
    const [row] = await asService<{ admin_user_id_by_email: string | null }>(
      `SELECT admin_user_id_by_email('nobody@example.test')`,
    )
    expect(row.admin_user_id_by_email).toBe(null)
  })
})

describe('admin_owner_count', () => {
  it.runIf(reachable)('counts only owners', async () => {
    const [row] = await asService<{ admin_owner_count: number }>(
      'SELECT admin_owner_count($1)',
      [ORG_A],
    )
    expect(row.admin_owner_count).toBe(1)
  })

  it.runIf(reachable)('is zero for an Org with nobody in it', async () => {
    const [row] = await asService<{ admin_owner_count: number }>(
      'SELECT admin_owner_count($1)',
      ['0c000000-0000-0000-0000-0000000000c2'],
    )
    expect(row.admin_owner_count).toBe(0)
  })
})
