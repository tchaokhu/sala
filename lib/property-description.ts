// A Property's listing description, written from its own fields — the
// "Generate" button on the Property forms. Ported from Cozy Keys'
// PropertyForm generateDescription: no AI, a template over what is on screen.
// Thai, as the listings are; only the parts that have a value are said.

import type { PropertyType } from './property-input'

const TYPE_WORD: Record<PropertyType, string> = {
  condo: 'คอนโด',
  house: 'บ้านเดี่ยว',
  townhome: 'ทาวน์โฮม',
}

export interface DescribedProperty {
  type: PropertyType | string
  /** The Building's Thai name — the project the listing names. */
  buildingName?: string | null
  roomNumber?: string | null
  floor?: number | null
  areaSqm?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  priceMonthly?: number | null
}

export function describeProperty(p: DescribedProperty): string {
  const typeWord = TYPE_WORD[p.type as PropertyType] ?? 'ที่พัก'
  const building = p.buildingName?.trim()
  const lines = [`${typeWord}${building ? ` โครงการ${building}` : ''} ให้เช่า`]

  const specs: string[] = []
  if (p.areaSqm) specs.push(`พื้นที่ ${p.areaSqm} ตร.ม.`)
  specs.push(`${p.bedrooms ?? 0} ห้องนอน ${p.bathrooms ?? 0} ห้องน้ำ`)
  if (p.floor != null) specs.push(`ชั้น ${p.floor}`)
  if (p.roomNumber?.trim()) specs.push(`ห้อง ${p.roomNumber.trim()}`)
  lines.push(specs.join(' / '))

  if (p.priceMonthly) lines.push(`ค่าเช่า ${p.priceMonthly.toLocaleString('th-TH')} บาท/เดือน`)
  return lines.join('\n')
}
