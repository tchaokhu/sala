// Where an auth callback is allowed to send somebody, and how it explains a
// failure. Pure string handling, no Next and no Supabase, so the open-redirect
// guard can be tested exhaustively rather than reasoned about — it is the kind
// of check that is one missing branch away from being no check at all.

/** Why the person is back at the sign-in page. `expired` is a link that was used
 *  already or has timed out; `device` is a PKCE link opened somewhere other than
 *  the browser that asked for it. Different problems, different instructions. */
export type LinkError = 'expired' | 'device'

/** Only ever a path on this origin. `//evil.com` and `https://evil.com` would
 *  otherwise turn a callback into an open redirect, and a backslash is worth
 *  refusing too: some clients normalise `/\evil.com` to a protocol-relative URL.
 *  Anything unrecognised becomes `/`, which routes by Membership. */
export function safeNext(next: string | null | undefined): string {
  if (!next) return '/'
  if (!next.startsWith('/')) return '/'
  if (next.startsWith('//') || next.startsWith('/\\')) return '/'
  return next
}

/** Back to sign-in, saying why, keeping the destination. Without the reason the
 *  person lands on an empty form having been told nothing and clicks the dead
 *  link again; without `next` a second link drops them at the root instead of
 *  the page they were trying to reach. */
export function signInAgain(reason: LinkError, next: string): string {
  const params = new URLSearchParams({ error: reason })
  const destination = safeNext(next)
  if (destination !== '/') params.set('next', destination)
  return '/login?' + params.toString()
}

/** The email link types this app knows how to complete. Narrowed rather than
 *  cast: `type` arrives in a URL, and handing an arbitrary string to verifyOtp
 *  means the query decides which flow runs. */
const EMAIL_OTP_TYPES = ['invite', 'magiclink', 'signup', 'recovery', 'email_change'] as const

export type EmailLinkType = (typeof EMAIL_OTP_TYPES)[number]

export function emailLinkType(value: string | null | undefined): EmailLinkType | null {
  return EMAIL_OTP_TYPES.includes(value as EmailLinkType) ? (value as EmailLinkType) : null
}
