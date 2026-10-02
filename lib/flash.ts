// The toast for an action that ends in redirect().
//
// A redirecting Server Action returns nothing to the form that called it, so
// its success cannot travel back as an ActionResult. It leaves it in a cookie
// for one minute instead; components/Feedback.tsx reads it on the page the
// redirect lands on, shows it, and clears it. A cookie rather than the URL, so
// a name — an Owner's, a Tenant's — never sits in an address bar or a log.

import { cookies } from 'next/headers'

export const FLASH_COOKIE = 'sala_flash'

export async function flash(message: string, detail?: string): Promise<void> {
  ;(await cookies()).set(FLASH_COOKIE, encodeURIComponent(JSON.stringify({ message, detail })), {
    path: '/',
    maxAge: 60,
    sameSite: 'lax',
    // Read by the page's own script, which is the point; it holds nothing but
    // the words of the toast.
    httpOnly: false,
  })
}
