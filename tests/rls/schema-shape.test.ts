/**
 * The guard on ADR 0001.
 *
 * Sala keeps every Org in one database and relies entirely on Row Level
 * Security to keep them apart. A table that ships with RLS off, without an
 * org_id, or missing a policy is a hole that nothing in the application would
 * report — so this reads the live catalog and fails the build instead.
 *
 * When this test fails, the fix is the migration. It is never the allowlist.
 *
 *   docker compose up -d && npm run db:reset && npm run test:rls
 */

import { afterAll, describe, expect, it } from 'vitest'
import pg from 'pg'

/** Tables that legitimately have no org_id. An Org cannot belong to an Org, and
 *  membership is what every other table's policy is defined in terms of. */
const GLOBAL_TABLES = new Set(['orgs', 'memberships'])

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://sala:sala@localhost:54329/sala'

// Connected at module scope, not in beforeAll: `it.runIf` is evaluated while
// the file is being collected, which happens before any hook runs. Deciding
// there would skip every check below even when the database is up — exactly the
// silent pass this file exists to prevent.
const client = new pg.Client({ connectionString: DATABASE_URL, connectionTimeoutMillis: 3000 })
let reachable = false
try {
  await client.connect()
  reachable = true
} catch {
  // In CI an unreachable database is a failure. A green run that quietly
  // skipped the isolation checks is worse than a red one.
  if (process.env.CI) {
    throw new Error(
      `CI could not reach ${DATABASE_URL}. The schema-shape tests are not ` +
      `optional — start Postgres and run db:reset before the suite.`,
    )
  }
}

afterAll(async () => {
  if (reachable) await client.end()
})

const q = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await client.query(sql, params)).rows as T[]

describe('schema shape', () => {
  it('has a database to inspect', () => {
    expect(
      reachable,
      `Cannot reach ${DATABASE_URL}. Run: docker compose up -d && npm run db:reset`,
    ).toBe(true)
  })

  it.runIf(reachable)('found the tables it is meant to be checking', async () => {
    const rows = await q<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    )
    // Guards against the whole suite passing vacuously against an empty
    // database — every assertion below is "for each table", and no tables
    // means no assertions.
    expect(rows.length).toBeGreaterThanOrEqual(10)
  })

  it.runIf(reachable)('enables row level security on every table', async () => {
    const rows = await q<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND rowsecurity = false`,
    )
    expect(rows.map(r => r.tablename)).toEqual([])
  })

  it.runIf(reachable)('gives every org-scoped table an org_id that cannot be null', async () => {
    const tables = await q<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    )
    const scoped = tables.map(t => t.tablename).filter(t => !GLOBAL_TABLES.has(t))

    const cols = await q<{ table_name: string; is_nullable: string }>(
      `SELECT table_name, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'org_id'`,
    )
    const byTable = new Map(cols.map(c => [c.table_name, c.is_nullable]))

    const offenders = scoped.filter(t => byTable.get(t) !== 'NO')
    expect(offenders).toEqual([])
  })

  it.runIf(reachable)('points every org_id at orgs', async () => {
    const rows = await q<{ table_name: string }>(
      `SELECT c.conrelid::regclass::text AS table_name
         FROM pg_constraint c
         JOIN pg_attribute a
           ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.contype = 'f'
          AND a.attname = 'org_id'
          AND c.confrelid = 'orgs'::regclass`,
    )
    const withFk = new Set(rows.map(r => r.table_name))

    const tables = await q<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    )
    const scoped = tables.map(t => t.tablename).filter(t => !GLOBAL_TABLES.has(t))

    expect(scoped.filter(t => !withFk.has(t))).toEqual([])
  })

  it.runIf(reachable)('covers all four operations with a policy on every table', async () => {
    const rows = await q<{ tablename: string; cmd: string }>(
      `SELECT tablename, cmd FROM pg_policies WHERE schemaname = 'public'`,
    )
    const byTable = new Map<string, Set<string>>()
    for (const r of rows) {
      if (!byTable.has(r.tablename)) byTable.set(r.tablename, new Set())
      byTable.get(r.tablename)!.add(r.cmd)
    }

    const tables = await q<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    )

    const gaps: string[] = []
    for (const { tablename } of tables) {
      const cmds = byTable.get(tablename) ?? new Set()
      // ALL counts as covering everything.
      if (cmds.has('ALL')) continue
      for (const needed of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        // `orgs` is intentionally missing INSERT and DELETE: Orgs are created
        // by the operator through the SQL editor, never by the application.
        if (tablename === 'orgs' && (needed === 'INSERT' || needed === 'DELETE')) continue
        if (!cmds.has(needed)) gaps.push(`${tablename}.${needed}`)
      }
    }
    expect(gaps).toEqual([])
  })

  it.runIf(reachable)('scopes every org-scoped policy by org_id', async () => {
    const rows = await q<{ tablename: string; policyname: string; qual: string | null; with_check: string | null }>(
      `SELECT tablename, policyname, qual, with_check
         FROM pg_policies WHERE schemaname = 'public'`,
    )

    const offenders = rows
      .filter(r => !GLOBAL_TABLES.has(r.tablename))
      .filter(r => {
        const expr = `${r.qual ?? ''} ${r.with_check ?? ''}`
        return !expr.includes('org_id')
      })
      .map(r => `${r.tablename}.${r.policyname}`)

    expect(offenders).toEqual([])
  })

  it.runIf(reachable)('never grants a policy to anon', async () => {
    // A lead arriving from a bot goes through create_inquiry_via_token(), which
    // is SECURITY DEFINER. Cozy Keys instead left INSERT on inquiries open to
    // the anonymous role, which here would be a hole into every Org.
    const rows = await q<{ tablename: string; policyname: string; roles: string[] }>(
      `SELECT tablename, policyname, roles FROM pg_policies WHERE schemaname = 'public'`,
    )
    const offenders = rows
      .filter(r => r.roles.includes('anon') || r.roles.includes('public'))
      .map(r => `${r.tablename}.${r.policyname}`)
    expect(offenders).toEqual([])
  })

  it.runIf(reachable)('wraps membership checks in a subquery so they are planned once', async () => {
    // `is_member(org_id)` risks a call per row; `(SELECT is_member(org_id))`
    // becomes an InitPlan. Postgres renders the latter with a SELECT in the
    // stored expression, which is what we look for. See CLAUDE.md.
    const rows = await q<{ tablename: string; policyname: string; qual: string | null; with_check: string | null }>(
      `SELECT tablename, policyname, qual, with_check
         FROM pg_policies WHERE schemaname = 'public'`,
    )

    const offenders: string[] = []
    for (const r of rows) {
      for (const expr of [r.qual, r.with_check]) {
        if (!expr) continue
        if (/is_member|is_org_owner/.test(expr) && !/SELECT/i.test(expr)) {
          offenders.push(`${r.tablename}.${r.policyname}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it.runIf(reachable)('indexes org_id on every org-scoped table', async () => {
    // Every query filters by Org. An unindexed org_id turns each of them into a
    // sequential scan that gets slower as other agencies join.
    const tables = await q<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    )
    const scoped = tables.map(t => t.tablename).filter(t => !GLOBAL_TABLES.has(t))

    const rows = await q<{ tablename: string }>(
      `SELECT t.relname AS tablename
         FROM pg_index i
         JOIN pg_class t ON t.oid = i.indrelid
         JOIN pg_attribute a
           ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
        WHERE a.attname = 'org_id'`,
    )
    const indexed = new Set(rows.map(r => r.tablename))

    expect(scoped.filter(t => !indexed.has(t))).toEqual([])
  })

  it.runIf(reachable)('indexes every foreign key', async () => {
    // An unindexed FK makes the referenced side's deletes and updates scan.
    const rows = await q<{ tbl: string; col: string }>(
      `SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
         FROM pg_constraint c
         JOIN pg_attribute a
           ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f'
          AND c.connamespace = 'public'::regnamespace
          AND array_length(c.conkey, 1) = 1`,
    )

    const idx = await q<{ tbl: string; col: string }>(
      `SELECT t.relname AS tbl, a.attname AS col
         FROM pg_index i
         JOIN pg_class t ON t.oid = i.indrelid
         JOIN pg_attribute a
           ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
         JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'`,
    )
    const indexed = new Set(idx.map(r => `${r.tbl}.${r.col}`))

    expect(rows.filter(r => !indexed.has(`${r.tbl}.${r.col}`)).map(r => `${r.tbl}.${r.col}`))
      .toEqual([])
  })
})
