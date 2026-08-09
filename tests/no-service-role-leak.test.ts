/**
 * The guard on ADR 0006.
 *
 * The service role key bypasses every policy in the database, so the bound that
 * matters is not "we were careful" — it is that exactly one module reads it and
 * exactly one directory may import that module. A comment asking people to be
 * careful is not checkable. This is.
 *
 * It reads the source tree rather than the built output on purpose: a violation
 * should fail the moment it is written, not once someone thinks to inspect a
 * bundle.
 */

import { describe, expect, it } from 'vitest'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SKIP = new Set(['node_modules', '.next', '.git', 'dist', 'coverage'])
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/

/** The module that holds the key, and the only tree allowed to import it. */
const ADMIN_CLIENT = 'lib/supabase-admin.ts'
const ALLOWED_IMPORTERS = ['app/admin/', ADMIN_CLIENT]

/** The one thing outside a request path that needs the key: the Org purge
 *  (ADR 0010). CLAUDE.md scopes the key to "the cron job and app/admin/", and
 *  this is that cron job — Supabase Storage holds no session for it to borrow,
 *  so sweeping a purged Org's `{org_id}/` prefix cannot be done any other way.
 *  It runs from a terminal, never from a request, and never reaches a browser.
 *
 *  Named by exact path, not by a `scripts/` prefix: the next script to want
 *  this should have to add itself here and say why. */
const ALLOWED_SCRIPTS = ['scripts/purge-deleted-orgs.mjs']

async function sourceFiles(dir = ROOT): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.env.local.example') continue
    if (SKIP.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await sourceFiles(full)))
    else if (CODE.test(entry.name)) out.push(full)
  }
  return out
}

const files = await sourceFiles()
const posix = (p: string) => relative(ROOT, p).split(sep).join('/')

const read = async (p: string) => ({ path: posix(p), text: await readFile(p, 'utf8') })
const sources = await Promise.all(files.map(read))

describe('the service role key stays where ADR 0006 put it', () => {
  it('found a source tree to inspect', () => {
    // Every assertion below is "for each file"; no files would pass all of them
    // while checking nothing.
    expect(sources.length).toBeGreaterThan(15)
    expect(sources.map(s => s.path)).toContain(ADMIN_CLIENT)
  })

  it('is read in exactly one module, plus the purge script', () => {
    const readers = sources
      .filter(s => s.text.includes('SUPABASE_SERVICE_ROLE_KEY'))
      .map(s => s.path)
      .filter(p => p !== ADMIN_CLIENT && p !== 'tests/no-service-role-leak.test.ts')
      .filter(p => !ALLOWED_SCRIPTS.includes(p))
    expect(readers).toEqual([])
  })

  it('keeps the purge script out of anything a request can reach', () => {
    // The exception above is only safe while it stays a script. If something
    // under app/, lib/ or components/ ever imports it, the key is back in a
    // request path and ADR 0006's bound is gone.
    //
    // An import, not a mention: app/admin/actions.ts names the script in a
    // comment, because softDeleteOrg is the thing that schedules the work the
    // script finishes, and that cross-reference is worth keeping.
    const imported = ALLOWED_SCRIPTS.map(script =>
      new RegExp(`(?:from|require\\s*\\(|import\\s*\\()\\s*['"][^'"]*${
        script.replace(/^scripts\//, '').replace(/[.]/g, '\\.')
      }['"]`),
    )

    const importers = sources
      .filter(s => imported.some(re => re.test(s.text)))
      .map(s => s.path)
      .filter(p => p.startsWith('app/') || p.startsWith('lib/') || p.startsWith('components/'))
    expect(importers).toEqual([])
  })

  it('is never given a NEXT_PUBLIC_ prefix, which would inline it into the browser bundle', () => {
    const offenders = sources
      .filter(s => /NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/.test(s.text))
      .map(s => s.path)
      .filter(p => p !== 'tests/no-service-role-leak.test.ts')
    expect(offenders).toEqual([])
  })

  it('is imported only from app/admin/', () => {
    const importers = sources
      .filter(s => /from\s+['"](@\/lib\/supabase-admin|\.{1,2}\/[\w/.-]*supabase-admin)['"]/.test(s.text))
      .map(s => s.path)
      .filter(p => !ALLOWED_IMPORTERS.some(allowed => p.startsWith(allowed)))
    expect(importers).toEqual([])
  })

  it('is never reached from a client component', () => {
    // 'use server' files under app/admin/ are fine; a 'use client' one would
    // ship the import to the browser, where `server-only` throws at build time.
    // Asserting it here names the mistake instead of leaving a build error to
    // be interpreted.
    const offenders = sources
      .filter(s => /^\s*['"]use client['"]/.test(s.text))
      .filter(s => s.text.includes('supabase-admin'))
      .map(s => s.path)
    expect(offenders).toEqual([])
  })

  it('keeps every admin Server Action checking isSuperadmin itself', () => {
    // The layout gate gets the person to the page. It does not run in front of
    // a Server Action, which is an HTTP endpoint anyone can post to — so each
    // action file establishes the caller for itself.
    const actionFiles = sources.filter(
      s => s.path.startsWith('app/admin/') && /^\s*['"]use server['"]/.test(s.text),
    )
    expect(actionFiles.length).toBeGreaterThan(0)

    const missing = actionFiles
      .filter(s => !s.text.includes('requireSuperadmin'))
      .map(s => s.path)
    expect(missing).toEqual([])
  })
})
