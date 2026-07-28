// Apply supabase/migrations/*.sql to a real Supabase project, once.
//
//   1. Create the project in the Supabase dashboard.
//   2. Put its connection URI in .env.migrate (gitignored), as
//        SUPABASE_DB_URL=postgresql://postgres:[password]@db.<ref>.supabase.co:5432/postgres
//      or the pooler URI from Settings → Database → Connection string.
//   3. node scripts/db-apply-remote.mjs
//
// Name files to apply a subset — the way a migration written after the first
// run reaches the project, since re-running 0001 would error:
//
//   node scripts/db-apply-remote.mjs 0004_revoke_anon_table_grants.sql
//
// Unlike db-reset.mjs this never drops anything and never applies the test
// shims: on Supabase the auth and storage schemas, auth.uid() and the anon /
// authenticated roles are real. It runs 0002_storage.sql for the first time —
// locally that file no-ops. It is a first-run bootstrapper, not a repeatable
// migration runner: 0001 uses plain CREATE, so a second run errors rather than
// silently diverging. Track migrations with the Supabase CLI once one is set up.

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'

async function readEnvFile() {
  try {
    const text = await readFile(join(import.meta.dirname, '..', '.env.migrate'), 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*SUPABASE_DB_URL\s*=\s*(.+?)\s*$/)
      if (m) return m[1].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* no file — fall through to process.env */
  }
  return null
}

const url = process.env.SUPABASE_DB_URL ?? (await readEnvFile())
if (!url) {
  console.error(
    'No SUPABASE_DB_URL. Put it in .env.migrate (gitignored) or the environment.\n' +
    'Get it from Supabase → Settings → Database → Connection string (URI).',
  )
  process.exit(1)
}

const host = new URL(url).hostname
if (['localhost', '127.0.0.1', '::1', 'db'].includes(host)) {
  console.error(
    `Refusing to run the remote applier against a local host (${host}).\n` +
    `For the local test database use: npm run db:reset`,
  )
  process.exit(1)
}

// Supabase requires TLS. The certificate is theirs and valid; we do not pin it.
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()
console.log(`Applying migrations to ${host}…`)

const dir = join(import.meta.dirname, '..', 'supabase', 'migrations')
const all = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()

// Named files run in the order given on the command line, not in file order:
// applying a subset is a deliberate act and the caller decides the sequence.
const wanted = process.argv.slice(2)
const missing = wanted.filter((f) => !all.includes(f))
if (missing.length) {
  console.error(`No such migration: ${missing.join(', ')}\nAvailable: ${all.join(', ')}`)
  process.exit(1)
}
const files = wanted.length ? wanted : all

for (const file of files) {
  const sql = await readFile(join(dir, file), 'utf8')
  try {
    await client.query(sql)
    console.log(`  ${file}`)
  } catch (err) {
    console.error(`\n${file} failed:\n${err.message}`)
    await client.end()
    process.exit(1)
  }
}

// Confirm the shape the way the RLS test does, so a green run means something.
const { rows } = await client.query(
  `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'`,
)
await client.end()
console.log(`Applied ${files.length} migration(s); ${rows[0].n} tables in public.`)
