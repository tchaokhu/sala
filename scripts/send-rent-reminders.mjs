// Tell each agency which rent is due tomorrow and which is already late.
//
//   node scripts/send-rent-reminders.mjs           # prints the digests, sends nothing
//   node scripts/send-rent-reminders.mjs --full    # same, with Tenant names unmasked
//   node scripts/send-rent-reminders.mjs --send    # sends them and stamps the rows
//   node scripts/send-rent-reminders.mjs --activate <slug>
//                                                  # start reminding this Org from today
//
// See docs/adr/0012-rent-reminders-are-a-digest-a-script-sends.md. One email
// per Org per day, first one the day before rent is due, again every two days
// while it stays unpaid, stopping thirty days past due.
//
// Run by a human. There is no scheduler in this codebase — the same sentence is
// at the top of purge-deleted-orgs.mjs, and when a deployment target exists,
// Rental expiry, Org purge and this move onto it together.
//
// Needs, from .env.migrate and .env.local (both gitignored):
//   SUPABASE_DB_URL   session pooler URI, as db-apply-remote.mjs uses
//   RESEND_API_KEY    only for --send; the dry run needs no mail account
//   REMINDER_FROM     the From address, e.g. "Sala <rent@yourdomain>"
//
// No service role key: the addresses come from auth.users over the same
// database connection, so ADR 0006's allowlist stays at two scripts.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'

const ROOT = join(import.meta.dirname, '..')
const SEND = process.argv.includes('--send')
/** The dry run masks Tenant names by default. The email needs them — the agent
 *  has to know who to call — but a terminal is a log, and CLAUDE.md keeps a
 *  Tenant's details out of logs. `--full` prints the body exactly as it will be
 *  sent, for the one time somebody wants to read it before turning this on. */
const FULL = process.argv.includes('--full')
const activateAt = process.argv.indexOf('--activate')
const ACTIVATE_SLUG = activateAt === -1 ? null : process.argv[activateAt + 1]

/** ADR 0012. Both are the agency's answer, not a guess, and both are here
 *  rather than in the SQL so the numbers are readable next to the reasoning. */
const REMIND_DAYS_BEFORE = 1
const REPEAT_EVERY_DAYS = 2
const STOP_AFTER_DAYS_OVERDUE = 30

async function envValue(file, key) {
  try {
    const text = await readFile(join(ROOT, file), 'utf8')
    return text.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, 'm'))?.[1]?.replace(/^["']|["']$/g, '') ?? null
  } catch {
    return null
  }
}

const DB = process.env.SUPABASE_DB_URL ?? (await envValue('.env.migrate', 'SUPABASE_DB_URL'))
if (!DB) {
  console.error('No SUPABASE_DB_URL. Put it in .env.migrate, as db-apply-remote.mjs does.')
  process.exit(1)
}

const db = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
db.on('error', () => {})
await db.connect()

/** Today in Bangkok, decided by Postgres so the script agrees with every date
 *  the app computes (CLAUDE.md — dates are Asia/Bangkok, everywhere). */
// As text, not as a date: node-postgres hands a `date` back as a JS Date at
// local midnight, and `toISOString()` on that shifts it back a day for anyone
// east of UTC. That is the exact bug CLAUDE.md names, and the fix is to never
// let a Date exist — Postgres formats it and JavaScript only compares strings.
const { rows: todayRows } = await db.query(
  `SELECT ((now() AT TIME ZONE 'Asia/Bangkok')::date)::text AS today`,
)
const TODAY = todayRows[0].today
console.log(`Today in Bangkok: ${TODAY}`)

// ─── activation ──────────────────────────────────────────────────────────────
// Switching an Org on when it already has months of unsettled rent would send
// one enormous digest about a backlog everybody knows about. Stamping the
// existing overdue rows makes reminding start from today (ADR 0012); the
// backlog stays visible in the app, which is where it belongs.

if (ACTIVATE_SLUG) {
  const { rows } = await db.query(
    `UPDATE payments p
        SET last_reminded_on = (now() AT TIME ZONE 'Asia/Bangkok')::date
       FROM rentals r, orgs o
      WHERE p.rental_id = r.id
        AND p.org_id = o.id
        AND o.slug = $1
        AND p.type = 'rent'
        AND p.outstanding > 0
        AND p.last_reminded_on IS NULL
        AND p.due_date < (now() AT TIME ZONE 'Asia/Bangkok')::date
      RETURNING p.id`,
    [ACTIVATE_SLUG],
  )
  console.log(`Activated ${ACTIVATE_SLUG}: ${rows.length} already-overdue Payments marked as of today.`)
  console.log('Reminders for that Org start from the next due date, not from the backlog.')
  await db.end()
  process.exit(0)
}

// ─── who to remind about what ────────────────────────────────────────────────

const { rows: due } = await db.query(
  `SELECT o.id   AS org_id,
          o.slug AS org_slug,
          o.name AS org_name,
          p.id   AS payment_id,
          p.due_date::text AS due_date,
          p.outstanding AS amount,  -- what is still owed, not the face amount (0018)
          pr.title AS property_title,
          r.tenant_name_snapshot AS tenant_name
     FROM payments p
     JOIN rentals    r  ON r.id = p.rental_id
     JOIN properties pr ON pr.id = p.property_id
     JOIN orgs       o  ON o.id = p.org_id
    WHERE p.type = 'rent'
      AND p.outstanding > 0
      AND r.rent_tracked_by_us
      AND r.status = 'active'
      AND p.due_date <= (now() AT TIME ZONE 'Asia/Bangkok')::date + $1::int
      AND p.due_date >= (now() AT TIME ZONE 'Asia/Bangkok')::date - $2::int
      AND (p.last_reminded_on IS NULL
           OR p.last_reminded_on <= (now() AT TIME ZONE 'Asia/Bangkok')::date - $3::int)
    ORDER BY o.name, p.due_date, pr.title`,
  [REMIND_DAYS_BEFORE, STOP_AFTER_DAYS_OVERDUE, REPEAT_EVERY_DAYS],
)

if (due.length === 0) {
  console.log('Nothing due to remind about.')
  await db.end()
  process.exit(0)
}

/** Every Member of an Org, because Sala has no per-Property assignment and
 *  inventing an assignee here would be inventing a permission model. */
const { rows: people } = await db.query(
  `SELECT m.org_id, u.email
     FROM memberships m
     JOIN auth.users u ON u.id = m.user_id
    WHERE u.email IS NOT NULL
      AND m.org_id = ANY($1::uuid[])`,
  [[...new Set(due.map((d) => d.org_id))]],
)

const recipients = new Map()
for (const p of people) {
  if (!recipients.has(p.org_id)) recipients.set(p.org_id, [])
  recipients.get(p.org_id).push(p.email)
}

const byOrg = new Map()
for (const row of due) {
  if (!byOrg.has(row.org_id)) byOrg.set(row.org_id, [])
  byOrg.get(row.org_id).push(row)
}

// ─── the digest ──────────────────────────────────────────────────────────────

const baht = (n) => `฿${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`

/** Plain text on purpose: this is a nudge to go and open the app, and a plain
 *  message renders the same everywhere and cannot break. Amounts are aligned so
 *  a column of them reads at a glance (CLAUDE.md). */
function digest(orgName, rows, { maskTenants = false } = {}) {
  const overdue = rows.filter((r) => r.due_date < TODAY)
  const soon = rows.filter((r) => r.due_date >= TODAY)
  const who = (name) => (maskTenants ? `${String(name ?? '').trim().slice(0, 1) || '?'}…` : name)
  const line = (r) =>
    `  ${r.due_date}  ${baht(r.amount).padStart(14)}  ${r.property_title} — ${who(r.tenant_name)}`

  const parts = [`Rent to chase — ${orgName}`, '']
  if (overdue.length) {
    parts.push(`Late (${overdue.length}):`, ...overdue.map(line), '')
  }
  if (soon.length) {
    parts.push(`Due tomorrow (${soon.length}):`, ...soon.map(line), '')
  }
  parts.push(
    `Total: ${baht(rows.reduce((sum, r) => sum + Number(r.amount), 0))}`,
    '',
    'Open Sala to mark anything that has been paid.',
    'Reminders stop 30 days after a due date.',
  )
  return parts.join('\n')
}

// ─── send, or show ───────────────────────────────────────────────────────────

const RESEND_KEY = process.env.RESEND_API_KEY ?? (await envValue('.env.local', 'RESEND_API_KEY'))
const FROM = process.env.REMINDER_FROM ?? (await envValue('.env.local', 'REMINDER_FROM'))

if (SEND && (!RESEND_KEY || !FROM)) {
  console.error('\n--send needs RESEND_API_KEY and REMINDER_FROM in .env.local.')
  console.error('Swap the one function below for another provider if you use a different one.')
  await db.end()
  process.exit(1)
}

/** The only provider-shaped code in this file, so changing provider is one
 *  function rather than a rewrite. */
async function sendEmail(to, subject, text) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, text }),
  })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
}

let sentCount = 0
for (const [orgId, rows] of byOrg) {
  const orgName = rows[0].org_name
  const to = recipients.get(orgId) ?? []
  const body = digest(orgName, rows)
  const subject = `Rent to chase — ${rows.length} ${rows.length === 1 ? 'room' : 'rooms'}`

  const shown = FULL ? body : digest(orgName, rows, { maskTenants: true })
  console.log(`\n─── ${orgName} (${rows[0].org_slug}) → ${to.join(', ') || 'NOBODY'}`)
  console.log(shown.split('\n').map((l) => `    ${l}`).join('\n'))
  if (!FULL) console.log('    (Tenant names masked here — pass --full to see the real body)')

  if (!SEND) continue
  if (to.length === 0) {
    console.log('    skipped: this Org has no Member with an email address')
    continue
  }

  try {
    await sendEmail(to, subject, body)
    // Stamped only after the send succeeded, so a failure means the same rows
    // are picked up next run rather than silently skipped for two days.
    await db.query(
      `UPDATE payments SET last_reminded_on = (now() AT TIME ZONE 'Asia/Bangkok')::date
        WHERE id = ANY($1::uuid[])`,
      [rows.map((r) => r.payment_id)],
    )
    sentCount += 1
    console.log(`    sent, ${rows.length} Payments stamped`)
  } catch (err) {
    // The message names an Org and a status, never a Tenant or an amount.
    console.error(`    FAILED for ${rows[0].org_slug}: ${err.message}`)
  }
}

console.log(
  SEND
    ? `\nSent ${sentCount} of ${byOrg.size} digests.`
    : `\nDry run. ${byOrg.size} digest(s) would go out, covering ${due.length} Payments. Nothing was sent or stamped.`,
)
await db.end()
