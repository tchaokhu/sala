import { describe, expect, it } from 'vitest'
import { diffPostings, parsePostingsField, type PostingRow } from './postings'

const FB = '11111111-1111-1111-1111-111111111111'
const LI = '22222222-2222-2222-2222-222222222222'
const DD = '33333333-3333-3333-3333-333333333333'

function stored(platformId: string, postUrl: string | null, postedOn = '2026-08-01'): PostingRow {
  return { platformId, platformName: platformId, postUrl, postedOn }
}

describe('diffPostings', () => {
  it('writes nothing when the tick-list did not change', () => {
    const current = [stored(FB, 'https://fb.example/1'), stored(LI, null)]
    const next = [
      { platformId: FB, postUrl: 'https://fb.example/1', postedOn: '2026-08-01' },
      { platformId: LI, postUrl: null, postedOn: '2026-08-01' },
    ]
    expect(diffPostings(current, next)).toEqual({
      insert: [],
      update: [],
      removePlatformIds: [],
    })
  })

  it('inserts a newly ticked channel', () => {
    const diff = diffPostings(
      [stored(FB, null)],
      [
        { platformId: FB, postUrl: null, postedOn: '2026-08-01' },
        { platformId: LI, postUrl: null, postedOn: '2026-08-23' },
      ],
    )
    expect(diff.insert).toEqual([{ platformId: LI, postUrl: null, postedOn: '2026-08-23' }])
    expect(diff.update).toEqual([])
    expect(diff.removePlatformIds).toEqual([])
  })

  it('removes an un-ticked channel rather than flagging it', () => {
    const diff = diffPostings([stored(FB, null), stored(LI, null)], [
      { platformId: FB, postUrl: null, postedOn: '2026-08-01' },
    ])
    expect(diff.removePlatformIds).toEqual([LI])
    expect(diff.insert).toEqual([])
    expect(diff.update).toEqual([])
  })

  it('updates when only the link changed', () => {
    const diff = diffPostings(
      [stored(FB, 'https://fb.example/old')],
      [{ platformId: FB, postUrl: 'https://fb.example/new', postedOn: '2026-08-01' }],
    )
    expect(diff.update).toEqual([
      { platformId: FB, postUrl: 'https://fb.example/new', postedOn: '2026-08-01' },
    ])
    expect(diff.insert).toEqual([])
    expect(diff.removePlatformIds).toEqual([])
  })

  it('updates when only the date changed', () => {
    const diff = diffPostings(
      [stored(FB, null, '2026-08-01')],
      [{ platformId: FB, postUrl: null, postedOn: '2026-08-20' }],
    )
    expect(diff.update).toHaveLength(1)
  })

  it('handles all three kinds at once', () => {
    const diff = diffPostings(
      [stored(FB, 'https://fb.example/old'), stored(LI, null)],
      [
        { platformId: FB, postUrl: 'https://fb.example/new', postedOn: '2026-08-01' },
        { platformId: DD, postUrl: null, postedOn: '2026-08-23' },
      ],
    )
    expect(diff.insert.map((p) => p.platformId)).toEqual([DD])
    expect(diff.update.map((p) => p.platformId)).toEqual([FB])
    expect(diff.removePlatformIds).toEqual([LI])
  })

  it('clearing every tick removes every row', () => {
    const diff = diffPostings([stored(FB, null), stored(LI, null)], [])
    expect(diff.removePlatformIds).toEqual([FB, LI])
  })
})

describe('parsePostingsField', () => {
  const today = '2026-08-23'

  it('reads an empty tick-list from a missing field', () => {
    expect(parsePostingsField(null, today)).toEqual([])
    expect(parsePostingsField('', today)).toEqual([])
  })

  it('treats malformed JSON as an empty tick-list rather than throwing', () => {
    expect(parsePostingsField('{not json', today)).toEqual([])
    expect(parsePostingsField('{"platformId":"x"}', today)).toEqual([])
  })

  it('keeps a well-formed entry', () => {
    const out = parsePostingsField(
      JSON.stringify([{ platformId: FB, postUrl: ' https://fb.example/1 ', postedOn: '2026-08-10' }]),
      today,
    )
    expect(out).toEqual([{ platformId: FB, postUrl: 'https://fb.example/1', postedOn: '2026-08-10' }])
  })

  it('falls back to today when the date is missing or malformed', () => {
    const out = parsePostingsField(
      JSON.stringify([
        { platformId: FB },
        { platformId: LI, postedOn: 'yesterday' },
      ]),
      today,
    )
    expect(out.map((p) => p.postedOn)).toEqual([today, today])
  })

  it('turns a blank link into null rather than an empty string', () => {
    const out = parsePostingsField(JSON.stringify([{ platformId: FB, postUrl: '   ' }]), today)
    expect(out[0].postUrl).toBeNull()
  })

  it('drops entries with no platform id', () => {
    const out = parsePostingsField(
      JSON.stringify([{ postUrl: 'https://x.example' }, { platformId: '  ' }, { platformId: FB }]),
      today,
    )
    expect(out.map((p) => p.platformId)).toEqual([FB])
  })

  it('keeps the first of a duplicated platform id — the unique index allows one', () => {
    const out = parsePostingsField(
      JSON.stringify([
        { platformId: FB, postUrl: 'https://first.example' },
        { platformId: FB, postUrl: 'https://second.example' },
      ]),
      today,
    )
    expect(out).toHaveLength(1)
    expect(out[0].postUrl).toBe('https://first.example')
  })

  it('ignores anything that is not an array', () => {
    expect(parsePostingsField(JSON.stringify({ platformId: FB }), today)).toEqual([])
    expect(parsePostingsField(JSON.stringify('nope'), today)).toEqual([])
  })
})
