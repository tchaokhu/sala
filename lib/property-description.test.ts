import { describe, expect, it } from 'vitest'
import { describeProperty } from './property-description'

describe('describeProperty', () => {
  it('writes the Cozy Keys listing shape from the fields', () => {
    expect(
      describeProperty({
        type: 'condo',
        buildingName: 'ดี คอนโด บลิซ',
        areaSqm: 35,
        bedrooms: 1,
        bathrooms: 1,
        floor: 7,
        roomNumber: '8606',
        priceMonthly: 7500,
      }),
    ).toBe('คอนโด โครงการดี คอนโด บลิซ ให้เช่า\nพื้นที่ 35 ตร.ม. / 1 ห้องนอน 1 ห้องน้ำ / ชั้น 7 / ห้อง 8606\nค่าเช่า 7,500 บาท/เดือน')
  })

  it('leaves out the parts that have no value', () => {
    expect(describeProperty({ type: 'house', bedrooms: 3, bathrooms: 2 })).toBe('บ้านเดี่ยว ให้เช่า\n3 ห้องนอน 2 ห้องน้ำ')
  })
})
