import { describe, expect, it } from 'vitest'
import {
  TEMPLATE_TAGS,
  amount,
  bahtWords,
  bahtWordsEn,
  englishDate,
  leaseMonths,
  tagValues,
  thaiDate,
  type TagSource,
} from './template-tags'

describe('bahtWords', () => {
  it.each([
    [0, 'ศูนย์บาทถ้วน'],
    [1, 'หนึ่งบาทถ้วน'],
    [11, 'สิบเอ็ดบาทถ้วน'],
    [21, 'ยี่สิบเอ็ดบาทถ้วน'],
    [101, 'หนึ่งร้อยเอ็ดบาทถ้วน'],
    [15000, 'หนึ่งหมื่นห้าพันบาทถ้วน'],
    [22500, 'สองหมื่นสองพันห้าร้อยบาทถ้วน'],
    [1_000_001, 'หนึ่งล้านเอ็ดบาทถ้วน'],
    [12_345_678, 'สิบสองล้านสามแสนสี่หมื่นห้าพันหกร้อยเจ็ดสิบแปดบาทถ้วน'],
    [100.5, 'หนึ่งร้อยบาทห้าสิบสตางค์'],
    [0.25, 'ศูนย์บาทยี่สิบห้าสตางค์'],
  ])('%d → %s', (n, words) => expect(bahtWords(n)).toBe(words))
})

describe('bahtWordsEn', () => {
  it.each([
    [15000, 'Fifteen Thousand Baht Only'],
    [22500, 'Twenty-Two Thousand Five Hundred Baht Only'],
    [1_000_001, 'One Million One Baht Only'],
    [100.5, 'One Hundred Baht and Fifty Satang'],
  ])('%d → %s', (n, words) => expect(bahtWordsEn(n)).toBe(words))
})

describe('dates and amounts', () => {
  it('writes the Buddhist year in Thai and the Gregorian in English', () => {
    expect(thaiDate('2026-10-01')).toBe('1 ตุลาคม 2569')
    expect(englishDate('2026-10-01')).toBe('1 October 2026')
  })
  it('groups digits and keeps satang only when there are any', () => {
    expect(amount(15000)).toBe('15,000')
    expect(amount(15000.5)).toBe('15,000.50')
  })
  it('counts the end date as part of the term', () => {
    expect(leaseMonths('2026-10-01', '2027-09-30')).toBe(12)
    expect(leaseMonths('2026-01-31', '2026-07-30')).toBe(6)
    expect(leaseMonths('2026-10-15', '2026-11-01')).toBe(0)
  })
})

describe('tagValues', () => {
  const source: TagSource = {
    today: '2026-10-03',
    orgName: 'Cozy Keys',
    rental: { startDate: '2026-10-01', endDate: '2027-09-30', monthlyRent: 15000, deposit: 30000 },
    tenant: { name: 'สมชาย ใจดี', phone: null, idCard: '1234567890123', address: '  ', emergencyContact: null },
    property: { title: 'Lumpini 12/34', roomNumber: '12/34', floor: 8 },
    building: null,
    owner: { name: 'วิชัย', phone: null },
  }

  it('fills what Sala knows and leaves out the rest', () => {
    expect(
      tagValues(
        ['tenant_name', 'tenant_address', 'start_day', 'start_month', 'start_year', 'deposit_words',
          'lease_months', 'floor', 'building_name', 'contract_date', 'late_fee'],
        source,
      ),
    ).toEqual({
      tenant_name: 'สมชาย ใจดี',
      start_day: '1',
      start_month: 'ตุลาคม',
      start_year: '2569',
      deposit_words: 'สามหมื่นบาทถ้วน',
      lease_months: '12',
      floor: '8',
      contract_date: '3 ตุลาคม 2569',
    })
  })

  it('fills only the contract date from nothing', () => {
    expect(tagValues(TEMPLATE_TAGS.map((t) => t.tag), { today: '2026-10-03' })).toEqual({
      contract_date: '3 ตุลาคม 2569',
      contract_date_en: '3 October 2026',
      contract_day: '3',
      contract_month: 'ตุลาคม',
      contract_year: '2569',
    })
  })

  it('has one definition per tag, each a valid docxtemplater name', () => {
    const tags = TEMPLATE_TAGS.map((t) => t.tag)
    expect(new Set(tags).size).toBe(tags.length)
    for (const t of tags) expect(t).toMatch(/^[a-z][a-z0-9_]*$/)
  })
})
