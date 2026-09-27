// One-time load of The Cozy Keys into Sala's first Org.
//
//   node scripts/etl-cozy-keys.mjs            # dry run — reads, writes nothing
//   node scripts/etl-cozy-keys.mjs --commit   # does it
//
// See docs/adr/0003-cozy-keys-becomes-org-one.md and
// docs/adr/0004-fresh-supabase-project-cozy-keys-etl.md. This is the ETL those
// two describe: a cutover, not an upgrade. Cozy Keys' rows are read over
// PostgREST with its service role key (its own RLS is built on an `is_admin()`
// world that does not come across), mapped onto Sala's shape, and inserted
// under the first Org's id.
//
// PRIVACY. `tenants.id_card` and its neighbours move through this process and
// are never printed, never logged, and never summarised beyond a row count
// (CLAUDE.md). Every report line below is a count, a table name, or a storage
// key — if you are adding output, keep it that way.
//
// ORDERING. Bytes go up before the rows that name them, the same way
// `createProperty` does it (ADR 0007), so a committed row can never point at an
// object that never arrived. The row load itself is one transaction: it either
// all lands or none of it does. Objects uploaded before a failed transaction
// are orphans under a prefix nothing references — harmless, and sweepable.
//
// Credentials, all gitignored:
//   .env.migrate  SUPABASE_DB_URL          Sala, session pooler   (writes rows)
//   .env.migrate  COZY_SERVICE_ROLE_KEY    Cozy Keys service role (reads all)
//   .env.local    NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//                                          Sala                   (writes bytes)

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'

const ROOT = join(import.meta.dirname, '..')
const COMMIT = process.argv.includes('--commit')

/** `--inventory` loads only what CONTEXT.md calls Inventory: Property, Building
 *  and Owner, plus the Property photos. Tenancy, money and paperwork wait for
 *  their own pass. Building is not optional inside that set — a Property points
 *  at one, so leaving Buildings behind would strand every `building_id`. */
const SCOPE = process.argv.includes('--inventory') ? 'inventory' : 'all'
const INVENTORY_ONLY = SCOPE === 'inventory'
console.log(`Scope: ${SCOPE}${INVENTORY_ONLY ? ' (buildings, owners, properties, photos)' : ''}`)

// ─── env ─────────────────────────────────────────────────────────────────────

async function envFile(name) {
  try {
    return await readFile(join(ROOT, name), 'utf8')
  } catch {
    return ''
  }
}

const migrateEnv = await envFile('.env.migrate')
const localEnv = await envFile('.env.local')
const cozyEnv = await readFile(join(ROOT, '..', 'the-cozy-keys', '.env.local'), 'utf8')

const pick = (text, key) =>
  text.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, 'm'))?.[1]?.replace(/^["']|["']$/g, '') ??
  null

const SALA_DB = process.env.SUPABASE_DB_URL ?? pick(migrateEnv, 'SUPABASE_DB_URL')
const SALA_URL = pick(localEnv, 'NEXT_PUBLIC_SUPABASE_URL')
const SALA_KEY = pick(localEnv, 'SUPABASE_SERVICE_ROLE_KEY')
const COZY_URL = pick(cozyEnv, 'NEXT_PUBLIC_SUPABASE_URL')
const COZY_KEY =
  process.env.COZY_SERVICE_ROLE_KEY ??
  pick(migrateEnv, 'COZY_SERVICE_ROLE_KEY') ??
  pick(cozyEnv, 'SUPABASE_SERVICE_ROLE_KEY')

const missing = Object.entries({ SALA_DB, SALA_URL, SALA_KEY, COZY_URL, COZY_KEY })
  .filter(([, v]) => !v)
  .map(([k]) => k)
if (missing.length) {
  console.error(`Missing credentials: ${missing.join(', ')}`)
  console.error(
    'COZY_SERVICE_ROLE_KEY goes in .env.migrate — Cozy Keys dashboard → Settings → API → service_role.',
  )
  process.exit(1)
}

const SALA_BUCKET = 'sala-images'

// ─── reading Cozy Keys ───────────────────────────────────────────────────────

/** Every row of one table, paged, as the service role — so RLS is not what
 *  decides whether the load is complete. */
async function readAll(table) {
  const out = []
  const size = 1000
  for (let from = 0; ; from += size) {
    const res = await fetch(`${COZY_URL}/rest/v1/${table}?select=*&limit=${size}&offset=${from}`, {
      headers: { apikey: COZY_KEY, Authorization: `Bearer ${COZY_KEY}` },
    })
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200).replace(/\s+/g, ' ')
      throw new Error(`${table}: ${res.status} ${body}`)
    }
    const page = await res.json()
    out.push(...page)
    if (page.length < size) return out
  }
}

const TABLES = [
  'buildings',
  'owners',
  'properties',
  'tenants',
  'rentals',
  'payments',
  'inquiries',
  'document_templates',
  'rental_documents',
  'posting_platforms',
  'property_postings',
  // Not loaded (ADR 0003) — read only so they can be dumped before the old
  // project is deleted, keeping the decision reversible.
  'post_templates',
  'chat_logs',
]

console.log(`Reading ${new URL(COZY_URL).hostname}…`)
const src = {}
for (const t of TABLES) {
  try {
    src[t] = await readAll(t)
    console.log(`  ${t.padEnd(20)} ${String(src[t].length).padStart(6)}`)
  } catch (err) {
    src[t] = []
    console.log(`  ${t.padEnd(20)}      ? ${err.message}`)
  }
}

// ─── mapping decisions, reported before they are applied ─────────────────────

const BANGKOK = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' })
const bangkokDate = (iso) => (iso ? BANGKOK.format(new Date(iso)) : null)

/** A Rental counts as one the agency collects rent on when at least one of its
 *  rent Payments was actually settled. Read off the data rather than guessed —
 *  the collection model differs per agency and per room (ADR 0011). */
const settledRentRentalIds = new Set(
  src.payments.filter((p) => p.type === 'rent' && p.paid_date).map((p) => p.rental_id),
)
const collecting = src.rentals.filter((r) => settledRentRentalIds.has(r.id)).length

/**
 * One Cozy Keys payment as a Sala one.
 *
 * Two things changed between the schemas and both are load-bearing:
 *
 *   * `paid_date` / `paid_amount` are `settled_date` / `settled_amount` here.
 *   * Sala CHECKs that the pair is all-or-nothing —
 *     `(settled_date IS NULL) = (settled_amount IS NULL)` — because a date with
 *     no amount is a half-finished form, not a settlement.
 *
 * A row that recorded a date but never an amount is read as paid in full: the
 * agency wrote down that the money arrived, and the sum it was expecting is
 * right there in `amount`. A row with an amount and no date is the other half
 * of the same mistake and there is no honest date to invent for it, so it loads
 * as unsettled. Both cases are counted below before anything is written.
 *
 * Cozy Keys had no `direction` column and no `deposit_refund` type, so every
 * row it holds is money coming in.
 */
function mapPayment(p) {
  const hasDate = Boolean(p.paid_date)
  const hasAmount = p.paid_amount !== null && p.paid_amount !== undefined
  return {
    ...stamp(p),
    direction: 'in',
    settled_date: hasDate ? p.paid_date : null,
    settled_amount: hasDate ? (hasAmount ? p.paid_amount : p.amount) : null,
  }
}

const paymentOddities = {
  dateWithoutAmount: src.payments.filter((p) => p.paid_date && p.paid_amount == null).length,
  amountWithoutDate: src.payments.filter((p) => !p.paid_date && p.paid_amount != null).length,
  // `amount > 0` is a CHECK here and was not one there.
  zeroOrNegativeAmount: src.payments.filter((p) => !(Number(p.amount) > 0)).length,
}

/** Only Postings that record a real advertisement come across; Cozy Keys wrote
 *  a row per property × platform whether or not it was posted (0011). */
const realPostings = src.property_postings.filter((p) => p.posted)

/** Storage keys are not personal data, so a few samples are safe to print —
 *  and necessary, because whether these are bare paths or full URLs decides
 *  how the bytes are fetched. */
const imagePaths = src.properties.flatMap((p) => p.images ?? [])

/** Three kinds turned up in the real data, and they are fetched differently:
 *  a public URL, a bare storage key, and — for a good share of the rows — the
 *  bytes themselves inlined as a base64 data URI. Cozy Keys wrote those into the
 *  column instead of Storage, which is why they have to be decoded here rather
 *  than downloaded. */
function refShape(ref) {
  if (/^data:/i.test(ref)) return 'data'
  if (/^https?:/i.test(ref)) return 'url'
  return 'path'
}
const shapeCounts = imagePaths.reduce((acc, r) => {
  const k = refShape(r)
  acc[k] = (acc[k] ?? 0) + 1
  return acc
}, {})
/** Never print a whole reference: a data URI is the entire photo. */
const brief = (ref) => (ref.length > 90 ? `${ref.slice(0, 90)}… (${ref.length} chars)` : ref)

console.log('\nMapping')
console.log(`  rentals with settled rent → rent_tracked_by_us = true   : ${collecting}`)
console.log(`  postings actually posted (of ${src.property_postings.length})     : ${realPostings.length}`)
console.log(`  property images to copy                                : ${imagePaths.length}`)
console.log(`  image reference shapes                                 : ${JSON.stringify(shapeCounts)}`)
for (const shape of Object.keys(shapeCounts)) {
  console.log(`    ${shape.padEnd(5)} e.g. ${brief(imagePaths.find((r) => refShape(r) === shape))}`)
}
const docRefs = [
  ...src.document_templates.flatMap((d) => [d.pdf_storage_path, d.docx_storage_path]),
  ...src.rental_documents.map((d) => d.storage_path),
].filter(Boolean)
console.log(`  payments needing repair                                : ${JSON.stringify(paymentOddities)}`)
console.log(`  document files to copy                                 : ${docRefs.length}`)
if (docRefs.length) console.log(`    e.g. ${brief(docRefs[0])}`)
// Document references arrive as bare keys with no bucket in them —
// `agency_contract/<uuid>.pdf` and the like. Rather than guess which bucket
// that folder lives in, ask the project what buckets it has and try them in
// turn; the first that answers is remembered for every later file.
const cozyBuckets = await (async () => {
  const res = await fetch(`${COZY_URL}/storage/v1/bucket`, {
    headers: { apikey: COZY_KEY, Authorization: `Bearer ${COZY_KEY}` },
  })
  if (!res.ok) return []
  return (await res.json()).map((b) => b.name)
})()
console.log(`  buckets on the old project                             : ${cozyBuckets.join(', ') || 'none visible'}`)

console.log(`  not loaded: post_templates ${src.post_templates.length}, chat_logs ${src.chat_logs.length} (dumped to disk)`)

// ─── the target Org ──────────────────────────────────────────────────────────

const db = new pg.Client({ connectionString: SALA_DB, ssl: { rejectUnauthorized: false } })
db.on('error', () => {})
await db.connect()

const { rows: orgRows } = await db.query(`SELECT id FROM orgs WHERE slug = 'cozy-keys'`)
if (orgRows.length !== 1) {
  console.error("\nNo Org with slug 'cozy-keys' in Sala. Create it first — the operator does that by hand (ADR 0004).")
  await db.end()
  process.exit(1)
}
const ORG = orgRows[0].id

const { rows: existing } = await db.query(
  `SELECT
     (SELECT count(*)::int FROM properties WHERE org_id = $1) AS properties,
     (SELECT count(*)::int FROM buildings  WHERE org_id = $1) AS buildings,
     (SELECT count(*)::int FROM rentals    WHERE org_id = $1) AS rentals`,
  [ORG],
)
console.log(`\nTarget Org ${ORG}`)
console.log(`  already holds: ${JSON.stringify(existing[0])} — these are deleted first`)

// ─── dumping what is deliberately left behind ────────────────────────────────

if (src.post_templates.length || src.chat_logs.length) {
  const path = join(ROOT, '..', 'cozy-keys-not-loaded.json')
  if (COMMIT) {
    await writeFile(
      path,
      JSON.stringify({ post_templates: src.post_templates, chat_logs: src.chat_logs }, null, 2),
    )
    console.log(`  dumped post_templates and chat_logs to ${path}`)
  } else {
    console.log(`  would dump post_templates and chat_logs to ${path}`)
  }
}

if (!COMMIT) {
  console.log('\nDry run. Nothing was written. Re-run with --commit to load.')
  await db.end()
  process.exit(0)
}

// ─── bytes first (ADR 0007) ──────────────────────────────────────────────────

/** New key under Sala's convention: `{org_id}/{property_id}/{index}.{ext}`.
 *  Storage keys never reuse the uploaded filename (CLAUDE.md), and the index
 *  keeps a Property's photos in the order the row lists them. */
function salaKey(propertyId, index, sourceRef) {
  // A data URI carries its type in the header and has no filename to read.
  const fromData = sourceRef.match(/^data:image\/([a-z0-9+]+)/i)?.[1]
  const ext = (
    fromData === 'jpeg' ? 'jpg'
    : fromData ? fromData
    : (sourceRef.split('?')[0].match(/\.([a-z0-9]{3,4})$/i)?.[1] ?? 'jpg')
  ).toLowerCase()
  return `${ORG}/${propertyId}/${index}.${ext}`
}

async function fetchBytes(ref) {
  // Inlined bytes: nothing to fetch, just decode. These never touched Cozy
  // Keys' Storage, so this is the only place they exist.
  if (/^data:/i.test(ref)) {
    const [header, b64] = ref.split(',', 2)
    if (!b64) throw new Error('malformed data URI')
    return {
      body: Buffer.from(b64, 'base64'),
      type: header.match(/^data:([^;]+)/i)?.[1] ?? 'image/jpeg',
    }
  }
  // A full URL is fetched as it stands; a bare key is read out of Cozy Keys'
  // own bucket with its service role, which works whether or not it is public.
  if (/^https?:/i.test(ref)) {
    const res = await fetch(ref)
    if (!res.ok) throw new Error(`GET ${res.status}`)
    return { body: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') }
  }
  // A bare key. It may or may not begin with its bucket, so both readings are
  // tried: the key as given under each known bucket, and the key's own first
  // segment treated as one. `resolvedBucket` remembers the first that worked,
  // so this costs a probe once rather than per file.
  const key = ref.replace(/^\/+/, '')
  const [maybeBucket, ...rest] = key.split('/')
  const attempts = []
  if (resolvedBucket) attempts.push([resolvedBucket, key])
  for (const b of cozyBuckets) if (b !== resolvedBucket) attempts.push([b, key])
  if (cozyBuckets.includes(maybeBucket)) attempts.push([maybeBucket, rest.join('/')])

  let lastStatus = 'no buckets to try'
  for (const [bucket, objectKey] of attempts) {
    const res = await fetch(`${COZY_URL}/storage/v1/object/${bucket}/${objectKey}`, {
      headers: { apikey: COZY_KEY, Authorization: `Bearer ${COZY_KEY}` },
    })
    if (res.ok) {
      resolvedBucket = bucket
      return { body: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') }
    }
    lastStatus = `storage ${res.status}`
  }
  throw new Error(lastStatus)
}

/** Set by the first bare key that resolves, so the rest go straight there. */
let resolvedBucket = null

console.log('\nCopying photos…')
const newImages = new Map() // property id → new keys, in order
const imageFailures = []

for (const p of src.properties) {
  const refs = p.images ?? []
  const keys = []
  for (const [i, ref] of refs.entries()) {
    const key = salaKey(p.id, i, ref)
    try {
      const { body, type } = await fetchBytes(ref)
      const up = await fetch(`${SALA_URL}/storage/v1/object/${SALA_BUCKET}/${key}`, {
        method: 'POST',
        headers: {
          apikey: SALA_KEY,
          Authorization: `Bearer ${SALA_KEY}`,
          'Content-Type': type || 'image/jpeg',
          'x-upsert': 'true',
        },
        body,
      })
      if (!up.ok) throw new Error(`upload ${up.status}`)
      keys.push(key)
    } catch (err) {
      // The key is safe to print; it names a room, not a person.
      // The Sala key names a room, not a person, and never the source ref —
      // which for an inlined image would be the whole photo.
      imageFailures.push(`${key}: ${err.message}`)
    }
  }
  newImages.set(p.id, keys)
}
console.log(`  uploaded ${[...newImages.values()].flat().length} of ${imagePaths.length}`)
if (imageFailures.length) {
  console.log(`  ${imageFailures.length} failed:`)
  for (const f of imageFailures.slice(0, 10)) console.log(`    ${f}`)
}

// ─── documents ───────────────────────────────────────────────────────────────
// Cozy Keys kept a Document Template as up to two files on one row — a PDF and
// a DOCX of the same contract. Sala's `document_templates.storage_path` is one
// file, NOT NULL. The shape is resolved here rather than by bending the schema
// (ADR 0004): one row per file that actually exists, sharing the title, told
// apart by `file_name`. Nothing is dropped and nothing is invented.

const SALA_DOCS = 'sala-docs'

async function copyDoc(ref, key, mime) {
  const { body, type } = await fetchBytes(ref)
  const up = await fetch(`${SALA_URL}/storage/v1/object/${SALA_DOCS}/${key}`, {
    method: 'POST',
    headers: {
      apikey: SALA_KEY,
      Authorization: `Bearer ${SALA_KEY}`,
      'Content-Type': mime || type || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body,
  })
  if (!up.ok) throw new Error(`upload ${up.status}`)
  return body.length
}

const docFailures = []
const templateRows = []

if (INVENTORY_ONLY) {
  console.log('\nSkipping documents — --inventory')
} else {
  console.log('\nCopying documents…')
}
for (const t of INVENTORY_ONLY ? [] : src.document_templates) {
  const variants = [
    { path: t.pdf_storage_path, name: t.pdf_file_name, size: t.pdf_size_bytes, ext: 'pdf', mime: 'application/pdf' },
    {
      path: t.docx_storage_path,
      name: t.docx_file_name,
      size: t.docx_size_bytes,
      ext: 'docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
  ].filter((v) => v.path)

  for (const [i, v] of variants.entries()) {
    // The first variant keeps the original id so anything that referenced it
    // still resolves; a second file needs an id of its own.
    const id = i === 0 ? t.id : crypto.randomUUID()
    // Keyed by the source template and the format, not by the new row id —
    // the row id of a second variant is freshly minted, and keying on it would
    // strand a copy of every file each time this is re-run.
    const key = `${ORG}/templates/${t.id}.${v.ext}`
    try {
      const bytes = await copyDoc(v.path, key, v.mime)
      templateRows.push({
        id,
        org_id: ORG,
        category: t.category ?? 'other',
        title: t.title,
        description: t.description,
        storage_path: key,
        file_name: v.name ?? `${v.ext}-document.${v.ext}`,
        // size_bytes is NOT NULL and CHECK > 0, so a missing or zero source
        // size falls back to what actually arrived rather than failing the load.
        size_bytes: v.size && v.size > 0 ? v.size : bytes,
        // Cozy Keys' uploader ids are from another project's auth. Keeping them
        // would point at people who do not exist here (ADR 0009).
        uploaded_by: null,
        created_at: t.created_at,
      })
    } catch (err) {
      docFailures.push(`${key}: ${err.message}`)
    }
  }
}

const rentalDocRows = []
for (const d of INVENTORY_ONLY ? [] : src.rental_documents) {
  const ext = (d.file_name?.split('.').pop() ?? 'bin').toLowerCase().slice(0, 8)
  const key = `${ORG}/rentals/${d.rental_id}/${d.id}.${ext}`
  try {
    const bytes = await copyDoc(d.storage_path, key, d.mime_type)
    rentalDocRows.push({
      id: d.id,
      org_id: ORG,
      rental_id: d.rental_id,
      storage_path: key,
      file_name: d.file_name,
      mime_type: d.mime_type ?? 'application/octet-stream',
      size_bytes: d.size_bytes && d.size_bytes > 0 ? d.size_bytes : bytes,
      uploaded_by: null,
      created_at: d.created_at,
    })
  } catch (err) {
    docFailures.push(`${key}: ${err.message}`)
  }
}

if (!INVENTORY_ONLY) {
  console.log(`  uploaded ${templateRows.length} template files, ${rentalDocRows.length} rental documents`)
}
if (docFailures.length) {
  console.log(`  ${docFailures.length} failed:`)
  for (const f of docFailures.slice(0, 10)) console.log(`    ${f}`)
}

// ─── rows, in one transaction ────────────────────────────────────────────────

/** Insert rows with the given columns, one statement per table rather than one
 *  per row. `rows` are already mapped onto Sala's column names. */
async function insertAll(table, columns, rows) {
  if (rows.length === 0) return 0
  const CHUNK = 500
  let written = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const values = []
    const params = []
    let n = 1
    for (const r of chunk) {
      values.push(`(${columns.map(() => `$${n++}`).join(',')})`)
      params.push(...columns.map((c) => r[c] ?? null))
    }
    const { rowCount } = await db.query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${values.join(',')}`,
      params,
    )
    written += rowCount ?? 0
  }
  return written
}

const stamp = (r) => ({ ...r, org_id: ORG })

console.log('\nLoading rows…')
await db.query('BEGIN')
try {
  // Child rows first: every one of these is ON DELETE CASCADE or RESTRICT from
  // something below it, so deleting in this order needs no deferred constraints.
  // Only what this pass is about to write is cleared. Child rows first, so the
  // order needs no deferred constraints. Under --inventory the tenancy, money
  // and paperwork tables are left exactly as they are — a later pass owns them,
  // and clearing them here would delete rows this run has no replacement for.
  const clearing = INVENTORY_ONLY
    ? ['properties', 'owners', 'buildings']
    : [
        'postings',
        'platforms',
        'rental_documents',
        'document_templates',
        'payments',
        'rentals',
        'inquiries',
        'tenants',
        'properties',
        'owners',
        'buildings',
      ]
  for (const t of clearing) {
    await db.query(`DELETE FROM ${t} WHERE org_id = $1`, [ORG])
  }

  const counts = {}

  counts.buildings = await insertAll(
    'buildings',
    ['id', 'org_id', 'name', 'name_en', 'district', 'province', 'google_map_url', 'facilities', 'nearby', 'created_at'],
    src.buildings.map(stamp),
  )

  counts.owners = await insertAll(
    'owners',
    ['id', 'org_id', 'name', 'phone', 'email', 'line_id', 'note', 'source', 'created_at'],
    src.owners.map(stamp),
  )

  counts.properties = await insertAll(
    'properties',
    [
      'id', 'org_id', 'title', 'title_en', 'description', 'price_monthly', 'property_type',
      'bedrooms', 'bathrooms', 'area_sqm', 'floor', 'room_number', 'location', 'district',
      'province', 'status', 'images', 'contact_line', 'owner_id', 'building_id', 'mandate',
      'created_at',
    ],
    src.properties.map((p) => ({
      ...stamp(p),
      images: newImages.get(p.id) ?? [],
      // Everything Cozy Keys held was its own book; rooms sourced from a group
      // are a Sala idea and arrive later (ADR 0011).
      mandate: 'own',
    })),
  )

  if (!INVENTORY_ONLY) counts.tenants = await insertAll(
    'tenants',
    ['id', 'org_id', 'name', 'phone', 'email', 'line_id', 'id_card', 'address', 'emergency_contact', 'note', 'created_at'],
    src.tenants.map(stamp),
  )

  if (!INVENTORY_ONLY) counts.rentals = await insertAll(
    'rentals',
    [
      'id', 'org_id', 'property_id', 'tenant_id', 'tenant_name_snapshot', 'tenant_phone_snapshot',
      'start_date', 'end_date', 'monthly_rent', 'deposit', 'commission', 'rented_by_us',
      'rent_tracked_by_us', 'status', 'ended_at', 'ended_reason', 'note', 'created_at',
    ],
    // A settled rent Payment is evidence the agency was following the money,
    // which is what the flag records — not that it held it (ADR 0011, amended).
    src.rentals.map((r) => ({ ...stamp(r), rent_tracked_by_us: settledRentRentalIds.has(r.id) })),
  )

  if (!INVENTORY_ONLY) counts.payments = await insertAll(
    'payments',
    ['id', 'org_id', 'rental_id', 'property_id', 'direction', 'type', 'due_date', 'amount', 'settled_date', 'settled_amount', 'method', 'note', 'created_at'],
    src.payments.map(mapPayment),
  )

  if (!INVENTORY_ONLY) counts.inquiries = await insertAll(
    'inquiries',
    ['id', 'org_id', 'property_id', 'name', 'phone', 'email', 'message', 'preferred_date', 'status', 'created_at'],
    src.inquiries.map(stamp),
  )

  if (!INVENTORY_ONLY) counts.document_templates = await insertAll(
    'document_templates',
    ['id', 'org_id', 'category', 'title', 'description', 'storage_path', 'file_name', 'size_bytes', 'uploaded_by', 'created_at'],
    templateRows,
  )

  if (!INVENTORY_ONLY) counts.rental_documents = await insertAll(
    'rental_documents',
    ['id', 'org_id', 'rental_id', 'storage_path', 'file_name', 'mime_type', 'size_bytes', 'uploaded_by', 'created_at'],
    rentalDocRows,
  )

  if (!INVENTORY_ONLY) counts.platforms = await insertAll(
    'platforms',
    ['id', 'org_id', 'name', 'sort_order', 'active', 'created_at'],
    src.posting_platforms.map(stamp),
  )

  if (!INVENTORY_ONLY) counts.postings = await insertAll(
    'postings',
    ['id', 'org_id', 'property_id', 'platform_id', 'post_url', 'posted_on', 'created_at'],
    realPostings.map((p) => ({
      ...stamp(p),
      // No source column for this — approximated from when the row was written,
      // in Bangkok terms. Recorded here rather than silently.
      posted_on: bangkokDate(p.created_at),
    })),
  )

  await db.query('COMMIT')
  console.log('  ' + JSON.stringify(counts))
  console.log('\nLoaded. Verify in the app before archiving the old project.')
} catch (err) {
  await db.query('ROLLBACK')
  // Constraint messages can quote a row's values, and one of those tables holds
  // identity documents — so only the constraint name and table are reported.
  console.error(`\nRolled back. Nothing was written.`)
  console.error(`  ${err.table ? `table ${err.table}, ` : ''}${err.constraint ? `constraint ${err.constraint}, ` : ''}code ${err.code ?? '?'}`)
  await db.end()
  process.exit(1)
}

await db.end()
