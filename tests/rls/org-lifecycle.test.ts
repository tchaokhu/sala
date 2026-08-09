/**
 * An Org's life cycle, against the real policies and the real grants.
 *
 * ADR 0010 rests on one claim: setting `orgs.deleted_at` closes the Org to
 * everyone inside it *immediately*, through a single clause in `is_member()`,
 * with no per-table edit and no read-only grace mode running alongside the real
 * one. That claim is only worth what the catalog says, so this file proves it
 * where it matters — the Org's own row, the Member list, and a dependent table —
 * and proves the other three halves of the life cycle with it: that the service
 * role can still see what it has to restore, that restoring gives everything
 * back, and that `deleted_at` is not a column an Org's own admin may write.
 *
 * The case that matters throughout is a real, signed-in admin of the Org — not
 * an outsider and not an anonymous caller. An outsider was already refused
 * before any of this shipped.
 *
 *   docker compose up -d && npm run db:reset && npx vitest run tests/rls/org-lifecycle.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { parseCreateOrgForm } from '../../lib/org-input'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://sala:sala@localhost:54329/sala'

// Fixed ids on a suffix nothing else under tests/rls uses — these files run in
// parallel against one database, so a shared id is another file's fixtures
// vanishing mid-run. Taken elsewhere: a1/a2/a3, b1/b2, c1/c2/c3, d1, e1, f1.
const ORG_A = '0a000000-0000-0000-0000-0000000000d2'
const ORG_B = '0b000000-0000-0000-0000-0000000000d2'
const ADMIN_A = 'aa000000-0000-0000-0000-0000000000d2'
const MEMBER_A = 'ab000000-0000-0000-0000-0000000000d2'
// Org B exists only to show the clause keys on the Org being asked about: one
// agency's removal must not touch the next one's books.
const MEMBER_B = 'bb000000-0000-0000-0000-0000000000d2'
const PROPERTY_A = '1a000000-0000-0000-0000-0000000000d2'

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

/** Runs `body` as a signed-in caller, in a transaction that is always rolled
 *  back. Statements go one at a time because a parameterised query cannot carry
 *  two. */
async function asUser<T>(who: string, body: (q: Query) => Promise<T>): Promise<T> {
  await client.query('BEGIN')
  try {
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [who])
    await client.query('SET LOCAL ROLE authenticated')
    return await body(async (sql, params = []) => (await client.query(sql, params)).rows)
  } finally {
    await client.query('ROLLBACK')
  }
}

/** The same, with Org A soft-deleted first — inside the same transaction, so the
 *  removal is never visible to another test file and never outlives this one. */
async function whileSoftDeleted<T>(who: string, body: (q: Query) => Promise<T>): Promise<T> {
  await client.query('BEGIN')
  try {
    await client.query(`UPDATE orgs SET deleted_at = now() WHERE id = $1`, [ORG_A])
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [who])
    await client.query('SET LOCAL ROLE authenticated')
    return await body(async (sql, params = []) => (await client.query(sql, params)).rows)
  } finally {
    await client.query('ROLLBACK')
  }
}

/** Remove and restore in one transaction, switching between the operator's
 *  connection and a Member's session between steps. One transaction because the
 *  point is that the *same* Member gets the *same* rows back; SET ROLE is
 *  checked against the session user, which never changes, so switching back and
 *  forth is allowed. */
async function acrossTheLifecycle<T>(
  body: (act: { operator: Query; member: (who: string) => Query }) => Promise<T>,
): Promise<T> {
  await client.query('BEGIN')
  try {
    const operator: Query = async (sql, params = []) => {
      await client.query('RESET ROLE')
      return (await client.query(sql, params)).rows
    }
    const member = (who: string): Query => async (sql, params = []) => {
      await client.query('RESET ROLE')
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [who])
      await client.query('SET LOCAL ROLE authenticated')
      return (await client.query(sql, params)).rows
    }
    return await body({ operator, member })
  } finally {
    await client.query('ROLLBACK')
    await client.query('RESET ROLE')
  }
}

/** The console's role. BYPASSRLS locally, as it is on Supabase, so a test that
 *  passed only because the local role was weaker would not pass here. */
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

beforeAll(async () => {
  if (!reachable) return

  await client.query('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await client.query(
    `INSERT INTO orgs (id, slug, name) VALUES
       ($1, 'org-lifecycle-a', 'Lifecycle A'),
       ($2, 'org-lifecycle-b', 'Lifecycle B')`,
    [ORG_A, ORG_B],
  )
  await client.query(
    `INSERT INTO memberships (org_id, user_id, role) VALUES
       ($1, $2, 'admin'), ($1, $3, 'member'), ($4, $5, 'member')`,
    [ORG_A, ADMIN_A, MEMBER_A, ORG_B, MEMBER_B],
  )
  await client.query(
    `INSERT INTO properties (id, org_id, title, price_monthly, property_type)
     VALUES ($1, $2, 'ลุมพินี 9/9', 21000, 'condo')`,
    [PROPERTY_A, ORG_A],
  )
})

afterAll(async () => {
  if (!reachable) return
  await client.query('DELETE FROM orgs WHERE id = ANY($1)', [[ORG_A, ORG_B]])
  await client.end()
})

describe('a soft-deleted Org closes to the people inside it', () => {
  it('has a database to inspect', () => {
    expect(
      reachable,
      `Cannot reach ${DATABASE_URL}. Run: docker compose up -d && npm run db:reset`,
    ).toBe(true)
  })

  it.runIf(reachable)('lets an admin see all three while it is alive', async () => {
    // The other half of every case below: they fail after the removal because
    // of the removal, not because the fixtures were never reachable.
    const seen = await asUser(ADMIN_A, async (q) => ({
      orgs: await q('SELECT id FROM orgs WHERE id = $1', [ORG_A]),
      members: await q('SELECT user_id FROM memberships WHERE org_id = $1', [ORG_A]),
      properties: await q('SELECT id FROM properties WHERE org_id = $1', [ORG_A]),
    }))
    expect(seen.orgs).toHaveLength(1)
    expect(seen.members).toHaveLength(2)
    expect(seen.properties).toHaveLength(1)
  })

  it.runIf(reachable)('hides the Org\'s own row from its admin', async () => {
    // orgs_member_read calls the same is_member(), so the row a restore would
    // act on is invisible to everyone but the service role — which is why
    // restore has no in-Org alternative to consider.
    const rows = await whileSoftDeleted(ADMIN_A, (q) =>
      q('SELECT id FROM orgs WHERE id = $1', [ORG_A]),
    )
    expect(rows).toEqual([])
  })

  it.runIf(reachable)('hides the Member list', async () => {
    const rows = await whileSoftDeleted(ADMIN_A, (q) =>
      q('SELECT user_id FROM memberships WHERE org_id = $1', [ORG_A]),
    )
    expect(rows).toEqual([])
  })

  it.runIf(reachable)('hides a dependent table without a policy of its own being touched', async () => {
    // properties_member_select was never edited by 0010. It reads
    // (SELECT is_member(org_id)) and that is the whole of the change.
    const rows = await whileSoftDeleted(ADMIN_A, (q) =>
      q('SELECT id FROM properties WHERE org_id = $1', [ORG_A]),
    )
    expect(rows).toEqual([])
  })

  it.runIf(reachable)('refuses a write to a dependent table', async () => {
    await expect(
      whileSoftDeleted(ADMIN_A, (q) =>
        q(
          `INSERT INTO properties (org_id, title, price_monthly, property_type)
           VALUES ($1, 'ห้องใหม่', 15000, 'condo')`,
          [ORG_A],
        ),
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it.runIf(reachable)('closes it to a plain Member on the same terms', async () => {
    // Roles never decided what a Member could see (CONTEXT.md), and they do not
    // decide this either — the clause is in is_member(), below the Role.
    const rows = await whileSoftDeleted(MEMBER_A, (q) =>
      q('SELECT id FROM properties WHERE org_id = $1', [ORG_A]),
    )
    expect(rows).toEqual([])
  })

  it.runIf(reachable)('stops the admin adding anyone to an Org nobody can see', async () => {
    // is_org_admin() delegates to is_member() rather than repeating its clause,
    // so an admin loses the two admin powers with everything else.
    await expect(
      whileSoftDeleted(ADMIN_A, (q) =>
        q(`INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'member')`, [
          ORG_A, '0f000000-0000-0000-0000-0000000000d2',
        ]),
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it.runIf(reachable)('stops the admin removing anyone either', async () => {
    // DELETE has no WITH CHECK to violate — a refused delete is a silent
    // no-op, so the row count is the only evidence there is.
    const rows = await whileSoftDeleted(ADMIN_A, (q) =>
      q('DELETE FROM memberships WHERE org_id = $1 AND user_id = $2 RETURNING user_id', [
        ORG_A, MEMBER_A,
      ]),
    )
    expect(rows).toEqual([])
  })

  it.runIf(reachable)('leaves every other Org alone', async () => {
    const rows = await whileSoftDeleted(MEMBER_B, (q) =>
      q('SELECT id FROM orgs WHERE id = $1', [ORG_B]),
    )
    expect(rows).toHaveLength(1)
  })

  it.runIf(reachable)('stops a locked-out Member writing their Display Name', async () => {
    // The choke point is is_member(), and set_my_display_name (0006) is the one
    // member-facing write that does not pass through it: SECURITY DEFINER, its
    // own UPDATE ... WHERE org_id = p_org AND user_id = auth.uid(), granted to
    // `authenticated`. RLS is not in front of it, so the soft-delete clause is
    // not either, and a PostgREST rpc() call still lands in an Org whose every
    // other door is shut. 0010's own comment on is_org_admin names this class of
    // write as the thing to prevent.
    await expect(
      whileSoftDeleted(MEMBER_A, (q) => q(`SELECT set_my_display_name($1, 'still here')`, [ORG_A])),
    ).rejects.toThrow(/not a member/)
  })
})

describe('the Superadmin can still see what it has to restore', () => {
  it.runIf(reachable)('lets service_role read a soft-deleted Org', async () => {
    // createAdminClient() skips RLS entirely, so no is_member() bypass had to be
    // carved for the console. Asserted rather than assumed, because restore has
    // nothing to act on if this is not true.
    await client.query('BEGIN')
    try {
      await client.query(`UPDATE orgs SET deleted_at = now() WHERE id = $1`, [ORG_A])
      await client.query('SET LOCAL ROLE service_role')
      const { rows } = await client.query(
        'SELECT name, deleted_at FROM orgs WHERE id = $1',
        [ORG_A],
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].deleted_at).not.toBe(null)
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it.runIf(reachable)('carries deleted_at on admin_orgs, so the console splits the list in one call', async () => {
    await client.query('BEGIN')
    try {
      await client.query(`UPDATE orgs SET deleted_at = now() WHERE id = $1`, [ORG_A])
      await client.query('SET LOCAL ROLE service_role')
      const { rows } = await client.query<{
        slug: string
        deleted_at: Date | null
        member_count: number
        admin_count: number
      }>('SELECT * FROM admin_orgs(200)')

      const a = rows.find(r => r.slug === 'org-lifecycle-a')
      expect(a?.deleted_at).not.toBe(null)
      expect(a?.member_count).toBe(2)
      expect(a?.admin_count).toBe(1)

      const b = rows.find(r => r.slug === 'org-lifecycle-b')
      expect(b?.deleted_at).toBe(null)
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it.runIf(reachable)('indexes the handful of rows the purge script asks for', async () => {
    // scripts/purge-deleted-orgs.mjs has one query, `deleted_at < now() -
    // interval`, and the column is NULL for every Org that matters. A partial
    // index is the whole of what that needs, and CLAUDE.md wants it in the same
    // migration as the column.
    const { rows } = await client.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'orgs' AND indexdef LIKE '%deleted_at%'`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].indexdef).toMatch(/WHERE \(deleted_at IS NOT NULL\)/)
  })

  it.runIf(reachable)('keeps the slug reserved while the Org is recoverable', async () => {
    // ADR 0010's consequence, stated plainly: the row is still there, so slug
    // UNIQUE still holds against it. Reusing a slug before purge is refused
    // rather than quietly allowed to collide with what a restore would bring
    // back.
    await client.query('BEGIN')
    try {
      await client.query(`UPDATE orgs SET deleted_at = now() WHERE id = $1`, [ORG_A])
      await expect(
        client.query(`INSERT INTO orgs (slug, name) VALUES ('org-lifecycle-a', 'Impostor')`),
      ).rejects.toMatchObject({ code: '23505' })
    } finally {
      await client.query('ROLLBACK')
    }
  })
})

describe('restoring', () => {
  it.runIf(reachable)('gives the same Member the same rows back', async () => {
    const seen = await acrossTheLifecycle(async ({ operator, member }) => {
      const q = member(ADMIN_A)

      await operator(`UPDATE orgs SET deleted_at = now() WHERE id = $1`, [ORG_A])
      const closed = await q<{ id: string }>('SELECT id FROM properties WHERE org_id = $1', [ORG_A])

      await operator(`UPDATE orgs SET deleted_at = NULL WHERE id = $1`, [ORG_A])
      const reopened = await q<{ id: string; title: string }>(
        'SELECT id, title FROM properties WHERE org_id = $1',
        [ORG_A],
      )
      const org = await q<{ name: string }>('SELECT name FROM orgs WHERE id = $1', [ORG_A])

      return { closed, reopened, org }
    })

    expect(seen.closed).toEqual([])
    // Nothing was destroyed on the way through: the Property comes back with
    // its id and its title, not as a row a restore had to recreate.
    expect(seen.reopened).toEqual([{ id: PROPERTY_A, title: 'ลุมพินี 9/9' }])
    expect(seen.org).toEqual([{ name: 'Lifecycle A' }])
  })
})

describe('deleted_at is not an Org\'s own column to write', () => {
  it.runIf(reachable)('refuses an admin who names it directly', async () => {
    // RLS decides rows, not columns, so orgs_admin_update would have let an
    // admin lock their whole agency out — irreversibly, since is_member()
    // refuses them the moment the column is set. Column privileges are what
    // Postgres has for this, and the refusal is a grant error, not a policy one.
    await expect(
      asUser(ADMIN_A, (q) => q(`UPDATE orgs SET deleted_at = now() WHERE id = $1`, [ORG_A])),
    ).rejects.toThrow(/permission denied/i)
  })

  it.runIf(reachable)('refuses it even when the Org named is not theirs', async () => {
    await expect(
      asUser(MEMBER_B, (q) => q(`UPDATE orgs SET deleted_at = now() WHERE id = $1`, [ORG_A])),
    ).rejects.toThrow(/permission denied/i)
  })

  it.runIf(reachable)('still lets an admin rename their own Org', async () => {
    // The revoke has to be narrow: an admin's two powers are unchanged by ADR
    // 0010, and editing the Org is one of them.
    const rows = await asUser(ADMIN_A, (q) =>
      q(`UPDATE orgs SET name = 'Renamed' WHERE id = $1 RETURNING name`, [ORG_A]),
    )
    expect(rows).toEqual([{ name: 'Renamed' }])
  })

  it.runIf(reachable)('still refuses a plain Member the rename', async () => {
    const rows = await asUser(MEMBER_A, (q) =>
      q(`UPDATE orgs SET name = 'Renamed' WHERE id = $1 RETURNING name`, [ORG_A]),
    )
    expect(rows).toEqual([])
  })

  it.runIf(reachable)('grants authenticated UPDATE on exactly the three columns an Org may change', async () => {
    // From the catalog, not from the migration: the SQL that was meant to
    // produce a grant is not evidence that it did (CLAUDE.md). A fourth name
    // appearing here — deleted_at, created_at, id — is the hole this closes.
    const { rows } = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.column_privileges
        WHERE grantee = 'authenticated' AND table_schema = 'public'
          AND table_name = 'orgs' AND privilege_type = 'UPDATE'
        ORDER BY column_name`,
    )
    expect(rows.map(r => r.column_name)).toEqual(['intake_token_hash', 'name', 'slug'])
  })
})

describe('the last-Admin guard, under its new name', () => {
  it.runIf(reachable)('counts Admins and not Members', async () => {
    // wouldStrandOrg reads this number and refuses at 1. Org A holds one admin
    // and one plain Member.
    const [row] = await asService<{ admin_admin_count: number }>('SELECT admin_admin_count($1)', [
      ORG_A,
    ])
    expect(row.admin_admin_count).toBe(1)
  })

  it.runIf(reachable)('sees the second Admin as soon as there is one', async () => {
    // The guard's release condition: promote somebody, and the last-Admin
    // refusal stops applying.
    await client.query('BEGIN')
    try {
      await client.query(
        `UPDATE memberships SET role = 'admin' WHERE org_id = $1 AND user_id = $2`,
        [ORG_A, MEMBER_A],
      )
      await client.query('SET LOCAL ROLE service_role')
      const { rows } = await client.query<{ n: number }>('SELECT admin_admin_count($1) AS n', [
        ORG_A,
      ])
      expect(rows[0].n).toBe(2)
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it.runIf(reachable)('is refused to a signed-in user, like the console\'s other reads', async () => {
    await expect(
      asUser(ADMIN_A, (q) => q('SELECT admin_admin_count($1)', [ORG_A])),
    ).rejects.toThrow(/permission denied/i)
  })
})

describe('the Role rename left nothing behind', () => {
  it.runIf(reachable)('leaves org_role with admin and member', async () => {
    // A surviving 'owner' label would mean a row somewhere still holds it, and
    // every policy that reads role = 'admin' would quietly not apply to them.
    const { rows } = await client.query<{ label: string }>(
      `SELECT unnest(enum_range(NULL::org_role))::text AS label`,
    )
    expect(rows.map(r => r.label).sort()).toEqual(['admin', 'member'])
  })

  it.runIf(reachable)('leaves no function under the old name', async () => {
    const { rows } = await client.query<{ proname: string }>(
      `SELECT p.proname FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
        WHERE p.proname IN ('is_org_owner', 'admin_owner_count')`,
    )
    expect(rows.map(r => r.proname)).toEqual([])
  })

  it.runIf(reachable)('leaves no policy naming or calling the old helper', async () => {
    // The four policies were dropped and rebuilt rather than renamed, because a
    // rename keeps the frozen output alias and pg_policies would go on
    // rendering `AS is_org_owner` — a false trail for anyone grepping the
    // catalog. Both halves are checked: the names and the expressions.
    const { rows } = await client.query<{ policyname: string; expr: string }>(
      `SELECT policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
         FROM pg_policies WHERE schemaname = 'public'`,
    )
    const offenders = rows
      .filter(r => /is_org_owner/.test(r.expr) || /^(orgs|memberships)_owner_/.test(r.policyname))
      .map(r => r.policyname)
    expect(offenders).toEqual([])
  })
})

describe('the slug rule the form mirrors', () => {
  /** Whether the `orgs.slug` CHECK accepts it, asked of the database. */
  async function accepted(slug: string): Promise<boolean> {
    await client.query('BEGIN')
    try {
      await client.query(`INSERT INTO orgs (slug, name) VALUES ($1, 'Slug check')`, [slug])
      return true
    } catch {
      return false
    } finally {
      await client.query('ROLLBACK')
    }
  }

  it.runIf(reachable)('agrees with parseCreateOrgForm on every shape', async () => {
    // lib/org-input.ts restates the constraint so the person is told what is
    // wrong while they are still looking at the field. Two copies of a rule is
    // two places for it to drift, and only one of them is the real guard — so
    // the copy is checked against the original rather than against itself.
    const slugs = [
      'bkk-rentals', 'ab', 'a1', 'x'.repeat(40),
      'BKK-Rentals', 'bkk rentals', 'bkk_rentals', '-bkk', 'bkk-', 'bkk--rentals',
      'a', 'x'.repeat(41), 'ครัว',
    ]

    const disagreements: string[] = []
    for (const slug of slugs) {
      const parsed = parseCreateOrgForm({
        get: (name: string) =>
          ({ name: 'Slug check', slug, email: 'som@example.test' } as Record<string, string>)[name] ??
          null,
      })
      const db = await accepted(slug)
      if (parsed.ok !== db) disagreements.push(`${slug}: form ${parsed.ok}, database ${db}`)
    }
    expect(disagreements).toEqual([])
  })
})
