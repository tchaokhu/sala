/** Who operates Sala.
 *
 *  Superadmin is not a Role — it sits outside every Org and holds no Membership
 *  (CONTEXT.md). So it cannot be a row in a table whose whole shape is defined by
 *  belonging to an Org, and ADR 0006 explains why the two obvious alternatives
 *  (a table in `public`, a JWT claim) are worse than an environment variable.
 *
 *  The decision is a pure function of an id and a list, so it is testable without
 *  a database, a session or a Next request — the same seam require-member.ts uses.
 */

/** Parses the allowlist. Tolerant about separators and whitespace because this
 *  is hand-edited in a `.env` file, strict about the values themselves: anything
 *  that is not a uuid is dropped rather than kept as a string that can never
 *  match. A typo that silently grants nobody is recoverable; one that silently
 *  matches something would not be. */
export function parseSuperadminIds(raw: string | undefined): Set<string> {
  if (!raw) return new Set()
  return new Set(
    raw
      .split(/[,\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => UUID.test(s)),
  )
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** True when this user operates Sala. `null` is never a Superadmin, so a caller
 *  may hand the result of a failed session lookup straight in. */
export function isSuperadminId(userId: string | null | undefined, allowed: Set<string>): boolean {
  if (!userId) return false
  return allowed.has(userId.toLowerCase())
}

/** The production wiring. Read on every call rather than memoised at module
 *  scope: removing an operator already costs a redeploy (ADR 0006), and there is
 *  no reason to also make it depend on which module loaded first. The parse is a
 *  split over a string with one or two entries in it. */
export function isSuperadmin(userId: string | null | undefined): boolean {
  return isSuperadminId(userId, parseSuperadminIds(process.env.SALA_SUPERADMIN_USER_IDS))
}

/** True when nobody is configured — the console is then unreachable, which is
 *  the safe direction to fail. The gate uses this to warn in the server log, and
 *  never to change what it renders: telling a visitor that /admin exists but has
 *  no operators would confirm the page exists, which is the one thing the 404 is
 *  there to avoid. */
export function noSuperadminsConfigured(): boolean {
  return parseSuperadminIds(process.env.SALA_SUPERADMIN_USER_IDS).size === 0
}
