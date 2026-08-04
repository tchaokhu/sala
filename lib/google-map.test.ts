import { describe, expect, it } from 'vitest'
import {
  extractLatLng,
  extractPlaceName,
  isShortMapLink,
  mapEmbedSrc,
  normaliseMapUrl,
} from './google-map'

// The shapes a real paste takes: the desktop URL with the camera and the pin,
// the phone shortener, and the "share → copy link" API form.
const DESKTOP =
  'https://www.google.com/maps/place/Lumpini+Park+Rama+9/@13.7563,100.5018,17z/data=!4m6!3m5!1s0x0:0x0!8m2!3d13.7570!4d100.5025'
const SHORT = 'https://maps.app.goo.gl/aBcD1234'

describe('normaliseMapUrl', () => {
  it('keeps a Google link', () => {
    expect(normaliseMapUrl(DESKTOP)).toBe(DESKTOP)
    expect(normaliseMapUrl(SHORT)).toBe(SHORT)
    expect(normaliseMapUrl('https://maps.google.co.th/?q=13.75,100.50')).toContain('google.co.th')
  })

  it('refuses anything that is not a Google map', () => {
    // The stored value is fetched by the server to follow redirects, and is
    // later an iframe src. Both are reasons this list is closed.
    expect(normaliseMapUrl('https://example.com/maps/place/anywhere')).toBeNull()
    expect(normaliseMapUrl('https://google.com.evil.test/maps')).toBeNull()
    expect(normaliseMapUrl('https://notgoogle.com/maps')).toBeNull()
  })

  it('refuses schemes that are not http(s)', () => {
    expect(normaliseMapUrl('javascript:alert(1)')).toBeNull()
    expect(normaliseMapUrl('data:text/html,<script>')).toBeNull()
    expect(normaliseMapUrl('file:///etc/passwd')).toBeNull()
    expect(normaliseMapUrl('')).toBeNull()
    expect(normaliseMapUrl(null)).toBeNull()
  })
})

describe('isShortMapLink', () => {
  it('knows which links have to be followed first', () => {
    expect(isShortMapLink(SHORT)).toBe(true)
    expect(isShortMapLink('https://goo.gl/maps/xyz')).toBe(true)
    expect(isShortMapLink(DESKTOP)).toBe(false)
    expect(isShortMapLink('not a url')).toBe(false)
  })
})

describe('extractLatLng', () => {
  it('prefers the place pin over where the camera was left', () => {
    // !3d/!4d is the place; @ is the viewport, and they differ whenever
    // somebody panned the map before copying the link.
    expect(extractLatLng(DESKTOP)).toEqual({ lat: 13.757, lng: 100.5025 })
  })

  it('falls back to the camera when that is all there is', () => {
    expect(extractLatLng('https://www.google.com/maps/@13.7563,100.5018,17z')).toEqual({
      lat: 13.7563,
      lng: 100.5018,
    })
  })

  it('reads the query forms the share sheet produces', () => {
    expect(extractLatLng('https://www.google.com/maps/search/?api=1&query=13.75,100.5')).toEqual({
      lat: 13.75,
      lng: 100.5,
    })
    expect(extractLatLng('https://maps.google.com/?q=13.75,100.5')).toEqual({
      lat: 13.75,
      lng: 100.5,
    })
    expect(extractLatLng('https://maps.google.com/?ll=-13.75,-100.5')).toEqual({
      lat: -13.75,
      lng: -100.5,
    })
  })

  it('has nothing to give for a link that names no point', () => {
    expect(extractLatLng(SHORT)).toBeNull()
    expect(extractLatLng('https://www.google.com/maps/place/Somewhere')).toBeNull()
  })

  it('refuses coordinates that are not on Earth', () => {
    expect(extractLatLng('https://www.google.com/maps/@91,100.5,17z')).toBeNull()
    expect(extractLatLng('https://maps.google.com/?q=13.7,200.1')).toBeNull()
  })
})

describe('extractPlaceName', () => {
  it('reads the name Google puts in the path', () => {
    expect(extractPlaceName(DESKTOP)).toBe('Lumpini Park Rama 9')
    expect(extractPlaceName('https://www.google.com/maps/place/%E0%B8%A5%E0%B8%B8%E0%B8%A1%E0%B8%9E%E0%B8%B4%E0%B8%99%E0%B8%B5')).toBe('ลุมพินี')
  })

  it('has nothing to give when the path names no place', () => {
    expect(extractPlaceName('https://www.google.com/maps/@13.75,100.5,17z')).toBeNull()
    expect(extractPlaceName(SHORT)).toBeNull()
  })
})

describe('mapEmbedSrc', () => {
  it('centres on the pin when the link carries one', () => {
    expect(mapEmbedSrc(DESKTOP)).toBe(
      'https://www.google.com/maps?q=13.757,100.5025&z=17&hl=th&output=embed',
    )
  })

  it('falls back to the place name when there are no coordinates', () => {
    const src = mapEmbedSrc('https://www.google.com/maps/place/Lumpini+Park')
    expect(src).toBe('https://www.google.com/maps?q=Lumpini%20Park&z=17&hl=th&output=embed')
  })

  it('gives nothing for a link it cannot draw, rather than a blank frame', () => {
    // The form shows a button to open the link instead, and says why.
    expect(mapEmbedSrc(SHORT)).toBeNull()
    expect(mapEmbedSrc(null)).toBeNull()
  })
})
