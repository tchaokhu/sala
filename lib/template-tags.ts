// The tags a Document Template can carry, and what Sala fills each with
// (ADR 0017). Pure, no I/O: the fill page reads a Rental or a Property and
// hands the facts here; this decides the words.
//
// One table drives three things — the values, the fill form's labels, and the
// "Tags you can use" list — so they cannot drift apart. A tag not in it is
// still allowed in a template: the form asks for it as a blank field.
//
// Values carry a Tenant's ID number. Nothing here logs.

import { addDaysIso, addMonthsIso, parseIsoDate } from './dates'

/** What the fill page found to fill from. Every part is optional: a Property
 *  alone has no Tenant, and filling from nothing has only `today`. */
export interface TagSource {
  /** Bangkok today, YYYY-MM-DD — the contract date until someone changes it. */
  today: string
  orgName?: string | null
  rental?: { startDate: string; endDate: string; monthlyRent: number; deposit: number } | null
  tenant?: {
    name: string
    phone: string | null
    idCard: string | null
    address: string | null
    emergencyContact: string | null
  } | null
  property?: { title: string; roomNumber: string | null; floor: number | null } | null
  building?: {
    name: string
    nameEn: string | null
    subdistrict: string
    district: string
    province: string
    postcode: string
  } | null
  owner?: { name: string; phone: string | null } | null
}

export interface TagDef {
  tag: string
  label: string
  /** What it looks like filled, for the reference list. */
  example: string
  get: (s: TagSource) => string | null | undefined
}

// ─── Words ───────────────────────────────────────────────────────────────────

const TH_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]
const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** `1 ตุลาคม 2569` — Thai month, Buddhist year. */
export function thaiDate(iso: string): string {
  const { year, month, day } = parseIsoDate(iso)
  return `${day} ${TH_MONTHS[month - 1]} ${year + 543}`
}

/** `1 October 2026`. */
export function englishDate(iso: string): string {
  const { year, month, day } = parseIsoDate(iso)
  return `${day} ${EN_MONTHS[month - 1]} ${year}`
}

/** `15,000`, or `15,000.50` when there are satang. No symbol: the template
 *  already says บาท beside the blank. */
export function amount(n: number): string {
  const satang = Math.round(n * 100) % 100
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: satang ? 2 : 0,
    maximumFractionDigits: satang ? 2 : 0,
  }).format(n)
}

const TH_DIGITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const TH_PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']

/** A whole number read in Thai, the way a cheque writes it. */
function thaiNumber(n: number): string {
  if (n === 0) return 'ศูนย์'
  if (n >= 1_000_000) {
    const rest = n % 1_000_000
    // A lone one after ล้าน is เอ็ด, as after สิบ: หนึ่งล้านเอ็ด.
    return thaiNumber(Math.floor(n / 1_000_000)) + 'ล้าน' + (rest === 1 ? 'เอ็ด' : rest ? thaiNumber(rest) : '')
  }
  const digits = String(n).split('').map(Number)
  let out = ''
  digits.forEach((d, i) => {
    const place = digits.length - 1 - i
    if (d === 0) return
    if (place === 1 && d === 1) out += 'สิบ'
    else if (place === 1 && d === 2) out += 'ยี่สิบ'
    else if (place === 0 && d === 1 && digits.length > 1) out += 'เอ็ด'
    else out += TH_DIGITS[d] + TH_PLACES[place]
  })
  return out
}

/** `หนึ่งหมื่นห้าพันบาทถ้วน`, `…บาทห้าสิบสตางค์`. */
export function bahtWords(n: number): string {
  const satang = Math.round(n * 100)
  const baht = Math.floor(satang / 100)
  const rest = satang % 100
  return rest ? `${thaiNumber(baht)}บาท${thaiNumber(rest)}สตางค์` : `${thaiNumber(baht)}บาทถ้วน`
}

const EN_ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
]
const EN_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function englishNumber(n: number): string {
  if (n === 0) return 'Zero'
  const parts: string[] = []
  for (const [size, name] of [[1_000_000_000, 'Billion'], [1_000_000, 'Million'], [1000, 'Thousand']] as const) {
    if (n >= size) {
      parts.push(`${englishNumber(Math.floor(n / size))} ${name}`)
      n %= size
    }
  }
  if (n >= 100) {
    parts.push(`${EN_ONES[Math.floor(n / 100)]} Hundred`)
    n %= 100
  }
  if (n >= 20) {
    parts.push(EN_TENS[Math.floor(n / 10)] + (n % 10 ? `-${EN_ONES[n % 10]}` : ''))
  } else if (n > 0) {
    parts.push(EN_ONES[n])
  }
  return parts.join(' ')
}

/** `Fifteen Thousand Baht Only`, `… Baht and Fifty Satang`. */
export function bahtWordsEn(n: number): string {
  const satang = Math.round(n * 100)
  const baht = Math.floor(satang / 100)
  const rest = satang % 100
  return rest ? `${englishNumber(baht)} Baht and ${englishNumber(rest)} Satang` : `${englishNumber(baht)} Baht Only`
}

/** Whole months the term covers, counting the end date as a day of it:
 *  1 Oct 2026 – 30 Sep 2027 is 12. A term that is not whole months gives the
 *  whole months inside it. */
export function leaseMonths(startIso: string, endIso: string): number {
  const after = addDaysIso(endIso, 1)
  let n = 0
  while (addMonthsIso(startIso, n + 1) <= after) n++
  return n
}

// ─── The table ───────────────────────────────────────────────────────────────

function dateTags(base: string, label: string, pick: (s: TagSource) => string | null | undefined): TagDef[] {
  const at = (f: (iso: string) => string) => (s: TagSource) => {
    const iso = pick(s)
    return iso ? f(iso) : null
  }
  return [
    { tag: `${base}_date`, label, example: '1 ตุลาคม 2569', get: at(thaiDate) },
    { tag: `${base}_date_en`, label: `${label} (English)`, example: '1 October 2026', get: at(englishDate) },
    { tag: `${base}_day`, label: `${label} — day`, example: '1', get: at((d) => String(parseIsoDate(d).day)) },
    { tag: `${base}_month`, label: `${label} — month`, example: 'ตุลาคม', get: at((d) => TH_MONTHS[parseIsoDate(d).month - 1]) },
    { tag: `${base}_year`, label: `${label} — year (B.E.)`, example: '2569', get: at((d) => String(parseIsoDate(d).year + 543)) },
  ]
}

function moneyTags(base: string, label: string, pick: (s: TagSource) => number | null | undefined): TagDef[] {
  const at = (f: (n: number) => string) => (s: TagSource) => {
    const n = pick(s)
    return n === null || n === undefined ? null : f(n)
  }
  return [
    { tag: base, label, example: '15,000', get: at(amount) },
    { tag: `${base}_words`, label: `${label} in words`, example: 'หนึ่งหมื่นห้าพันบาทถ้วน', get: at(bahtWords) },
    { tag: `${base}_words_en`, label: `${label} in words (English)`, example: 'Fifteen Thousand Baht Only', get: at(bahtWordsEn) },
  ]
}

export const TEMPLATE_TAGS: TagDef[] = [
  ...dateTags('contract', 'Contract date', (s) => s.today),
  ...dateTags('start', 'Start date', (s) => s.rental?.startDate),
  ...dateTags('end', 'End date', (s) => s.rental?.endDate),
  {
    tag: 'lease_months',
    label: 'Term in months',
    example: '12',
    get: (s) => (s.rental ? String(leaseMonths(s.rental.startDate, s.rental.endDate)) : null),
  },
  ...moneyTags('monthly_rent', 'Rent/month', (s) => s.rental?.monthlyRent),
  ...moneyTags('deposit', 'Deposit', (s) => s.rental?.deposit),
  // The first month, paid in advance on signing — the rent, until someone
  // changes it on the form.
  ...moneyTags('advance_rent', 'Advance rent', (s) => s.rental?.monthlyRent),

  { tag: 'tenant_name', label: 'Tenant', example: 'สมชาย ใจดี', get: (s) => s.tenant?.name },
  { tag: 'tenant_phone', label: 'Tenant phone', example: '081-234-5678', get: (s) => s.tenant?.phone },
  { tag: 'tenant_id_card', label: 'Tenant ID card / passport', example: '1-2345-67890-12-3', get: (s) => s.tenant?.idCard },
  { tag: 'tenant_address', label: 'Tenant address', example: '99/1 ถ.สุขุมวิท …', get: (s) => s.tenant?.address },
  { tag: 'emergency_contact', label: 'Emergency contact', example: 'สมหญิง 089-…', get: (s) => s.tenant?.emergencyContact },

  { tag: 'owner_name', label: 'Owner', example: 'วิชัย มั่งมี', get: (s) => s.owner?.name },
  { tag: 'owner_phone', label: 'Owner phone', example: '082-…', get: (s) => s.owner?.phone },

  { tag: 'property_title', label: 'Property', example: 'Lumpini Park Rama 9 12/34', get: (s) => s.property?.title },
  { tag: 'room_number', label: 'Room number', example: '12/34', get: (s) => s.property?.roomNumber },
  { tag: 'floor', label: 'Floor', example: '8', get: (s) => (s.property?.floor == null ? null : String(s.property.floor)) },
  { tag: 'building_name', label: 'Building', example: 'ลุมพินี พาร์ค พระราม 9', get: (s) => s.building?.name },
  { tag: 'building_name_en', label: 'Building (English)', example: 'Lumpini Park Rama 9', get: (s) => s.building?.nameEn },
  { tag: 'building_subdistrict', label: 'Building subdistrict', example: 'บางกะปิ', get: (s) => s.building?.subdistrict },
  { tag: 'building_district', label: 'Building district', example: 'ห้วยขวาง', get: (s) => s.building?.district },
  { tag: 'building_province', label: 'Building province', example: 'กรุงเทพมหานคร', get: (s) => s.building?.province },
  { tag: 'building_postcode', label: 'Building postcode', example: '10310', get: (s) => s.building?.postcode },

  { tag: 'org_name', label: 'Agency', example: 'Cozy Keys', get: (s) => s.orgName },
]

const BY_TAG = new Map(TEMPLATE_TAGS.map((d) => [d.tag, d]))

export function tagLabel(tag: string): string {
  return BY_TAG.get(tag)?.label ?? tag
}

/** Sala's value for each of `tags` it can fill. A tag it does not know, or
 *  has nothing for, is left out — the form shows it blank. */
export function tagValues(tags: string[], source: TagSource): Record<string, string> {
  const out: Record<string, string> = {}
  for (const tag of tags) {
    const value = BY_TAG.get(tag)?.get(source)?.trim()
    if (value) out[tag] = value
  }
  return out
}

/** What an empty tag prints as, so the blank can still be written on. */
export const EMPTY_TAG = '....................'
