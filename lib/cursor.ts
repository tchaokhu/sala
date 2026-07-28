// Keyset pagination cursors. Pure, no I/O.
//
// Every list in Sala is bounded (CLAUDE.md): a limit and a cursor, always.
// The cursor is the sort key of the last row on the page — a timestamp and an
// id — not an offset. OFFSET makes the database count past everything it skips,
// which gets slower the further in you go, and it repeats or drops rows when
// something is inserted while a person is paging.
//
// The id is half the key, not a decoration. Payments and Properties arrive in
// batches — the Cozy Keys import will write thousands of rows inside one
// transaction, all sharing a created_at — and a cursor on the timestamp alone
// cannot tell those rows apart at a page boundary.

export interface PageKey {
  /** ISO 8601, exactly as Postgres returned it. */
  createdAt: string
  id: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Opaque, URL-safe. Opaque because a cursor is an implementation detail of the
 *  query, and a caller that starts constructing them by hand is one schema
 *  change away from a broken page. */
export function encodeCursor(key: PageKey): string {
  return Buffer.from(`${key.createdAt}|${key.id}`, 'utf8').toString('base64url')
}

/** Null for anything this module did not write. Cursors come from the address
 *  bar, so a malformed one is an ordinary event: the caller falls back to the
 *  first page rather than failing the request. */
export function decodeCursor(raw: string | null | undefined): PageKey | null {
  if (!raw) return null
  let text: string
  try {
    text = Buffer.from(raw, 'base64url').toString('utf8')
  } catch {
    return null
  }

  const parts = text.split('|')
  if (parts.length !== 2) return null
  const [createdAt, id] = parts
  if (!UUID.test(id)) return null
  if (!createdAt || Number.isNaN(Date.parse(createdAt))) return null

  return { createdAt, id }
}
