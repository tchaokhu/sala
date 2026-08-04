// Google Maps links: what Sala accepts, and what it can show a map of.
//
// Pure, no I/O. Following a short link needs the network and lives in
// ./google-map-resolve, which the Server Action calls; everything that decides
// whether a URL is acceptable, and how to draw it, is here where a test can
// reach it.
//
// Two separate jobs, deliberately not merged:
//   * `normaliseMapUrl` — may we store this at all? It is a person's paste, and
//     it later becomes an iframe src and a link. javascript: and data: are the
//     obvious no; a link to somewhere that is not Google is the less obvious one,
//     and it matters because ./google-map-resolve fetches what this returns.
//   * `mapEmbedSrc` — can we centre a map on it? Plenty of valid Google links
//     carry no coordinates, and those get a button instead of a silent blank.

import { safeHttpUrl } from './validate'

/** Hosts a stored map link may point at. The list is what makes the
 *  server-side redirect follow safe: an arbitrary URL fetched by the server is
 *  a request made from inside the network, and this is the fence around it. */
const MAP_HOSTS = new Set([
  'google.com',
  'www.google.com',
  'maps.google.com',
  'google.co.th',
  'www.google.co.th',
  'maps.google.co.th',
])

/** The shorteners the phone app produces. They redirect to a MAP_HOSTS URL. */
const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl'])

export function isMapHost(host: string): boolean {
  return MAP_HOSTS.has(host.toLowerCase())
}

export function isShortMapHost(host: string): boolean {
  return SHORT_HOSTS.has(host.toLowerCase())
}

/**
 * The URL as it may be stored, or null.
 *
 * http(s) only (`safeHttpUrl` does that half), and the host must be Google's.
 * Anything else — a shortener nobody here recognises, someone's own domain, a
 * javascript: URL — is refused rather than stored and rendered later.
 */
export function normaliseMapUrl(raw: string | null | undefined): string | null {
  const safe = safeHttpUrl(raw)
  if (!safe) return null
  const url = new URL(safe)
  if (!isMapHost(url.hostname) && !isShortMapHost(url.hostname)) return null
  return url.toString()
}

/** A link that has to be followed before anything can be drawn from it. */
export function isShortMapLink(url: string | null | undefined): boolean {
  const safe = safeHttpUrl(url)
  if (!safe) return false
  return isShortMapHost(new URL(safe).hostname)
}

export interface LatLng {
  lat: number
  lng: number
}

/**
 * The point a Google Maps URL is about, when it says so.
 *
 * Google writes it several ways and one URL often carries more than one. The
 * order here is deliberate: `!3d…!4d…` is the place's own pin, `@…` is only
 * where the camera happens to sit, and the two differ when somebody panned
 * before copying the link.
 */
export function extractLatLng(url: string | null | undefined): LatLng | null {
  const safe = safeHttpUrl(url)
  if (!safe) return null

  const parsed = new URL(safe)
  const href = decodeURIComponent(parsed.href)

  const pin = href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  if (pin) return valid(pin[1], pin[2])

  // ?q=13.75,100.50 and the maps.google.com/?api=1&query= form.
  for (const key of ['q', 'query', 'll', 'center', 'daddr']) {
    const value = parsed.searchParams.get(key)
    const pair = value?.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
    if (pair) {
      const point = valid(pair[1], pair[2])
      if (point) return point
    }
  }

  const camera = href.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (camera) return valid(camera[1], camera[2])

  return null
}

/** The place name out of a /place/<name>/ path, readable again. Google puts
 *  the name there with + for spaces, so a link with no coordinates can still
 *  centre a map on the right building. */
export function extractPlaceName(url: string | null | undefined): string | null {
  const safe = safeHttpUrl(url)
  if (!safe) return null
  const match = new URL(safe).pathname.match(/\/place\/([^/@]+)/)
  if (!match) return null
  try {
    const name = decodeURIComponent(match[1].replace(/\+/g, ' ')).trim()
    return name || null
  } catch {
    return null
  }
}

/**
 * What an iframe may be pointed at, or null when this link cannot be drawn.
 *
 * `output=embed` is the keyless embed. The official Embed API wants a key and a
 * billing account for the same picture, and Sala has neither — if that ever
 * changes, this is the one function that moves.
 */
export function mapEmbedSrc(url: string | null | undefined): string | null {
  const point = extractLatLng(url)
  if (point) {
    return `https://www.google.com/maps?q=${point.lat},${point.lng}&z=17&hl=th&output=embed`
  }

  const place = extractPlaceName(url)
  if (place) {
    return `https://www.google.com/maps?q=${encodeURIComponent(place)}&z=17&hl=th&output=embed`
  }

  return null
}

function valid(rawLat: string, rawLng: string): LatLng | null {
  const lat = Number(rawLat)
  const lng = Number(rawLng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}
