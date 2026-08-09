// Delete, for good, every Org soft-deleted more than 60 days ago.
//
// Run by a human. There is no scheduler in this codebase — ADR 0001 and ADR
// 0002 both describe a nightly job in prose and neither has ever been wired to
// one — and ADR 0010 deliberately does not invent one just for this. When a
// real deployment target exists and picks a scheduling mechanism, Org purge and
// Rental expiry move onto it together.
//
//   node scripts/purge-deleted-orgs.mjs            # says what it would delete
//   node scripts/purge-deleted-orgs.mjs --confirm  # deletes it
//
// Dry run is the default because this is the one irreversible operation in
// Sala. Everything else the operator can do is a soft delete with a way back;
// past this line an agency's books are gone.
//
// Needs, from .env.migrate and .env.local (both gitignored):
//   SUPABASE_DB_URL             session pooler URI, as db-apply-remote.mjs uses
//   NEXT_PUBLIC_SUPABASE_URL    the project's API origin
//   SUPABASE_SERVICE_ROLE_KEY   Storage holds no session for this to borrow
//
// On that last one: ADR 0006 bounds the service role key to lib/supabase-admin.ts
// and app/admin/, enforced by tests/no-service-role-leak.test.ts, which names
// this file as its one exception. CLAUDE.md's rule is "the cron job and
// app/admin/" — this *is* that cron job, running by hand until something exists
// to schedule it. It is not a request handler and never reaches a browser.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

/** The window ADR 0010 promises. Mirrored from lib/org-input.ts's
 *  ORG_RECOVERY_DAYS, which this file cannot import — the console counts down
 *  from that copy, and the interval below is what actually decides. */
const RECOVERY_DAYS = 60

/** Both buckets from 0002_storage.sql. Property photos are in sala-images;
 *  sala-docs holds Rental Documents and Document Templates, which is where an
 *  Org's signed contracts and Tenant identity scans live. An Org's prefix has
 *  to go from both, and forgetting the second is how identity documents
 *  outlive the agency that held them. */
const BUCKETS = ['sala-images', 'sala-docs']

const ROOT = join(import.meta.dirname, '..')
const confirmed = process.argv.includes('--confirm')

/** Reads KEY=value out of the gitignored env files, first file to name a key
 *  wins, and the real environment beats both. */
async function readEnv(names) {
  const found = {}
  for (const file of ['.env.migrate', '.env.local']) {
    let text
    try {
      text = await readFile(join(ROOT, file), 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m && names.includes(m[1]) && found[m[1]] === undefined) {
        found[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  }
  const out = {}
  for (const name of names) out[name] = process.env[name] ?? found[name] ?? null
  return out
}

const NEEDED = ['SUPABASE_DB_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
const env = await readEnv(NEEDED)
const missing = NEEDED.filter((n) => !env[n])
if (missing.length) {
  console.error(
    `Missing ${missing.join(', ')}.\n` +
    `SUPABASE_DB_URL goes in .env.migrate (Settings → Database → Connection string,\n` +
    `the session pooler URI — the direct host is IPv6-only). The other two are in\n` +
    `.env.local already if /admin works: Settings → API Keys.`,
  )
  process.exit(1)
}

const client = new pg.Client({
  connectionString: env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

const storage = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { rows: due } = await client.query(
  `SELECT id, slug, name, deleted_at
     FROM orgs
    WHERE deleted_at < now() - ($1 || ' days')::interval
    ORDER BY deleted_at`,
  [String(RECOVERY_DAYS)],
)

if (due.length === 0) {
  console.log(`Nothing to purge: no Org has been soft-deleted for ${RECOVERY_DAYS} days.`)
  await client.end()
  process.exit(0)
}

console.log(
  `${due.length} Org(s) past the ${RECOVERY_DAYS}-day window` +
  (confirmed ? ':' : ' — dry run, nothing will be deleted. Add --confirm to go ahead:'),
)
for (const org of due) {
  console.log(`  ${org.name} (/o/${org.slug}) soft-deleted ${org.deleted_at.toISOString().slice(0, 10)}`)
}

if (!confirmed) {
  await client.end()
  process.exit(0)
}

/** Every object key under a prefix. Storage's list() is one level deep and
 *  returns folders as entries with a null id, so reaching the photos at
 *  {org_id}/{property_id}/0.jpg means walking down to them. */
async function keysUnder(bucket, prefix) {
  const keys = []
  const pending = [prefix]

  while (pending.length) {
    const dir = pending.pop()
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await storage.storage.from(bucket).list(dir, {
        limit: 100,
        offset,
      })
      if (error) throw error
      if (!data || data.length === 0) break

      for (const entry of data) {
        const path = `${dir}/${entry.name}`
        if (entry.id === null) pending.push(path)
        else keys.push(path)
      }
      if (data.length < 100) break
    }
  }
  return keys
}

/** Best-effort, and logged rather than thrown — the same shape as `discard()`
 *  in lib/property-storage.ts, which this file cannot import (that module is
 *  TypeScript and builds a request-scoped client from cookies). An object left
 *  behind is an operator's problem; a half-purged Org is worse. */
async function sweep(bucket, keys) {
  let removed = 0
  for (let i = 0; i < keys.length; i += 100) {
    const batch = keys.slice(i, i + 100)
    const { error } = await storage.storage.from(bucket).remove(batch)
    if (error) {
      console.error(`  could not remove ${batch.length} object(s) from ${bucket}:`, error.message)
      continue
    }
    removed += batch.length
  }
  return removed
}

let purged = 0
let orphaned = 0

for (const org of due) {
  console.log(`\n${org.name} (/o/${org.slug})`)

  // Storage first, then the row — the reverse of Property delete, and
  // deliberately so (ADR 0010). Property delete sweeps only after its row
  // commits because an ON DELETE RESTRICT can refuse it, and a blocked delete
  // must never have touched Storage. An Org purge has no RESTRICT to fail on,
  // so there is nothing to reverse for: sweeping first means a script that dies
  // partway through leaves an orphaned object under a prefix nothing points at,
  // rather than an orgs row pointing at bytes that are already gone.
  let swept = 0
  for (const bucket of BUCKETS) {
    let keys
    try {
      keys = await keysUnder(bucket, org.id)
    } catch (err) {
      console.error(`  could not list ${bucket}/${org.id}/:`, err.message)
      orphaned++
      continue
    }
    if (keys.length === 0) continue

    const removed = await sweep(bucket, keys)
    swept += removed
    if (removed < keys.length) orphaned++
    console.log(`  ${bucket}: removed ${removed} of ${keys.length} object(s)`)
  }

  try {
    // Every dependent table is ON DELETE CASCADE from orgs (0001_init.sql), so
    // this one statement takes the Properties, Rentals, Payments, Tenants,
    // Inquiries, documents and Memberships with it. The auth accounts stay —
    // a person may hold a Membership in another Org, and deleting the account
    // would reach outside this one (the same bound removeMember keeps).
    const { rowCount } = await client.query(`DELETE FROM orgs WHERE id = $1`, [org.id])
    if (rowCount === 1) {
      purged++
      console.log(`  deleted the Org row and everything cascading from it (${swept} file(s) swept)`)
    } else {
      console.error(`  the Org row was already gone — Storage was swept anyway`)
    }
  } catch (err) {
    console.error(`  could not delete the Org row:`, err.message)
    console.error(`  its Storage objects are gone; re-run to finish, or delete the row by hand`)
  }
}

await client.end()

console.log(`\nPurged ${purged} of ${due.length} Org(s).`)
if (orphaned > 0) {
  console.log(
    `${orphaned} bucket sweep(s) did not complete. The rows are gone either way; ` +
    `the leftover objects sit under a {org_id}/ prefix nothing references.`,
  )
}
