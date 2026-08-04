// Following a short map link, once, on the server.
//
// A link copied from the phone app is maps.app.goo.gl/aBcD1234 — no
// coordinates, no place name, nothing an iframe can be pointed at. The redirect
// it stands for has all three, so the Server Action follows it at save time and
// stores what it lands on. See docs/adr/0008.
//
// This is the one place in Sala that fetches a URL a person typed, so the
// redirect chain is walked by hand rather than handed to `redirect: 'follow'`:
// every hop is checked against the same Google host list the paste was checked
// against, and a hop that leaves it ends the walk. A shortener is, by
// construction, somebody else's control over where our server points.

import { isMapHost, isShortMapLink, normaliseMapUrl } from './google-map'

const MAX_HOPS = 5
const TIMEOUT_MS = 5000

/**
 * The link to store: the resolved URL when the walk succeeds, the original when
 * it does not, and null when the paste was never acceptable.
 *
 * A failure here is not the person's problem — the link they gave is fine, it
 * just cannot be previewed — so it degrades to storing what they pasted rather
 * than refusing the save.
 */
export async function resolveMapUrl(raw: string | null | undefined): Promise<string | null> {
  const url = normaliseMapUrl(raw)
  if (!url) return null
  if (!isShortMapLink(url)) return url

  let current = url
  try {
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        // Nothing about the Org goes with it; this is a public link lookup.
        headers: { 'accept-language': 'th,en' },
      })

      const location = response.headers.get('location')
      if (!location) return isMapHost(new URL(current).hostname) ? current : url

      const next = new URL(location, current)
      if (next.protocol !== 'https:' && next.protocol !== 'http:') return url
      // The fence: a shortener may only send us somewhere we already trust.
      if (!isMapHost(next.hostname) && !isShortMapLink(next.toString())) return url

      current = next.toString()
      if (isMapHost(next.hostname)) return current
    }
  } catch (err) {
    // Timeout, DNS, offline. The link is still worth storing.
    console.error('[map] could not follow short link:', err)
    return url
  }

  return url
}
