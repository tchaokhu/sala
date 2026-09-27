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

  it.runIf(reachable)('carries org_id in every foreign key between two org-scoped tables', async () => {
    // A key on the id alone lets Org A's row name Org B's parent: RLS admits
    // the child's org_id and the FK admits the id (ADR 0013). Only a key that
    // matches org_id on both sides makes that row impossible to write.
    const rows = await q<{ edge: string; child_org: boolean; parent_org: boolean }>(
      `SELECT c.conrelid::regclass::text || '.' || c.conname AS edge,
              EXISTS (SELECT 1 FROM unnest(c.conkey) k
                        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
                       WHERE a.attname = 'org_id') AS child_org,
              EXISTS (SELECT 1 FROM unnest(c.confkey) k
                        JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k
                       WHERE a.attname = 'org_id') AS parent_org
         FROM pg_constraint c
         JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.contype = 'f'
          AND n.nspname = 'public'
          AND c.confrelid <> 'orgs'::regclass
          AND c.conrelid::regclass::text <> ALL ($1)
          AND c.confrelid::regclass::text <> ALL ($1)`,
      [[...GLOBAL_TABLES]],
    )
    // Vacuity guard: ten such edges existed when this was written.
    expect(rows.length).toBeGreaterThanOrEqual(10)
    expect(rows.filter(r => !r.child_org || !r.parent_org).map(r => r.edge)).toEqual([])
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

  it.runIf(reachable)('leaves anon no table privilege to fall back on', async () => {
    // Supabase grants anon SELECT/INSERT/UPDATE/DELETE on every table in public
    // as a default, and the local shims mirror that. RLS already refuses it —
    // no policy names anon — so today the grants are inert. They are removed
    // anyway: the day someone adds a permissive policy for a public listing
    // page, the grant decides how far that mistake reaches. anon's one way in
    // is create_inquiry_via_token(), which needs no table privilege at all.
    const rows = await q<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'anon' AND table_schema = 'public'`,
    )
    expect(rows.map(r => `${r.table_name}.${r.privilege_type}`)).toEqual([])
  })

  it.runIf(reachable)('lets anon execute only the one function it is meant to', async () => {
    // Read from the catalog, not from the migration's intent. 0006 wrote
    // `REVOKE ALL ON FUNCTION f FROM public` and shipped a SECURITY DEFINER
    // function that `anon` could still call, because Supabase's default
    // privileges grant EXECUTE to `anon` as a role and PUBLIC is a different
    // grantee. The SQL looked right; only the resulting privilege was wrong.
    //
    // An Inquiry from a bot is the single case anon has business calling
    // anything: create_inquiry_via_token authenticates on a secret and is the
    // only write path anon gets (ADR 0002). A second name appearing here is a
    // hole into every Org, and the fix is the migration, never this list.
    const ANON_MAY_EXECUTE = new Set(['create_inquiry_via_token'])

    // Extension-owned functions are excluded: locally `CREATE EXTENSION
    // pgcrypto` lands digest() and its two dozen neighbours in `public`, where
    // on Supabase they live in `extensions`. They are not ours to grant, and
    // listing them would make this assertion about the local layout rather than
    // about the schema under test.
    const rows = await q<{ proname: string }>(
      `SELECT DISTINCT p.proname
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
        WHERE has_function_privilege('anon', p.oid, 'EXECUTE')
          AND NOT EXISTS (
            SELECT 1 FROM pg_depend d
             WHERE d.objid = p.oid
               AND d.classid = 'pg_proc'::regclass
               AND d.deptype = 'e'
          )`,
    )

    const unexpected = rows.map(r => r.proname).filter(name => !ANON_MAY_EXECUTE.has(name))
    expect(unexpected.sort()).toEqual([])
  })

  it.runIf(reachable)('never lets a signed-in user call the Superadmin console\'s reads', async () => {
    // These are SECURITY DEFINER with no guard in the body — a Superadmin holds
    // no Membership, so there is nothing for the function to check. The grant is
    // the whole of the access control, which is why it is asserted rather than
    // assumed. See ADR 0006.
    const SERVICE_ROLE_ONLY = ['admin_orgs', 'admin_org_members', 'admin_user_id_by_email', 'admin_admin_count']

    const rows = await q<{ proname: string; role: string }>(
      `SELECT p.proname, r.rolname AS role
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
         CROSS JOIN (SELECT unnest(ARRAY['anon', 'authenticated']) AS rolname) r
        WHERE p.proname = ANY ($1)
          AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')`,
      [SERVICE_ROLE_ONLY],
    )
    expect(rows.map(r => `${r.proname} → ${r.role}`)).toEqual([])

    // And the other half: they exist and service_role can reach them, so the
    // assertion above is not passing because the functions are simply absent.
    const reachableByService = await q<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
        WHERE p.proname = ANY ($1)
          AND has_function_privilege('service_role', p.oid, 'EXECUTE')`,
      [SERVICE_ROLE_ONLY],
    )
    expect(reachableByService[0].n).toBe(SERVICE_ROLE_ONLY.length)
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
        if (/is_member|is_org_admin/.test(expr) && !/SELECT/i.test(expr)) {
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
