import { describe, expect, it } from 'vitest'
import {
  ACCEPTED_DOCUMENT_TYPES,
  DOCUMENT_KINDS,
  MAX_DOCUMENT_BYTES,
  documentExtension,
  documentFileName,
  parseDocumentKind,
  validateDocuments,
} from './document-input'

const MB = 1024 * 1024
const form = (kind: unknown) => ({ get: (n: string) => (n === 'kind' ? kind : null) })
const file = (name: string, type: string, size: number) => ({ name, type, size })

describe('parseDocumentKind', () => {
  it('accepts every kind', () => {
    for (const k of DOCUMENT_KINDS) expect(parseDocumentKind(form(k))).toEqual({ ok: true, values: k })
  })
  it.each([null, '', 'Contract', 'passport'])('refuses %j', (k) => {
    const r = parseDocumentKind(form(k))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('ID copy')
  })
})

describe('validateDocuments', () => {
  it('is exactly the bucket’s four types', () => {
    expect(Object.keys(ACCEPTED_DOCUMENT_TYPES).sort()).toEqual([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
    ])
    expect(documentExtension('image/webp')).toBeNull()
  })

  it('accepts a PDF and two JPEGs together', () => {
    expect(
      validateDocuments([
        file('a.pdf', 'application/pdf', 3 * MB),
        file('front.jpg', 'image/jpeg', MB),
        file('back.jpg', 'image/jpeg', MB),
      ]).ok,
    ).toBe(true)
  })

  it('accepts a file of exactly the limit', () => {
    expect(validateDocuments([file('a.pdf', 'application/pdf', MAX_DOCUMENT_BYTES)]).ok).toBe(true)
  })

  // Named like the file that will actually be uploaded, so a message that
  // repeated the name would be caught.
  const secret = 'บัตรประชาชน สมชาย.jpg'
  const cases: [string, ReturnType<typeof file>[], string][] = [
    ['empty', [], 'at least one'],
    ['wrong type', [file(secret, 'image/webp', MB)], 'PDF'],
    ['one file over 20 MB', [file(secret, 'image/jpeg', 21 * MB)], '20 MB'],
    ['total over 20 MB', [file(secret, 'image/jpeg', 12 * MB), file(secret, 'image/png', 12 * MB)], '24 MB'],
  ]
  it.each(cases)('refuses %s, naming the limit and never the file', (_, files, expected) => {
    const r = validateDocuments(files)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.message).toContain(expected)
    expect(r.message).not.toContain('สมชาย')
    expect(r.message).not.toContain('.jpg')
  })

  // The total case above matches on the sum it reports; the limit itself is
  // what tells the person how to split the batch.
  it('states the 20 MB limit when the total is over', () => {
    const r = validateDocuments([file('a.pdf', 'application/pdf', 12 * MB), file('b.pdf', 'application/pdf', 12 * MB)])
    expect(!r.ok && r.message).toContain('under 20 MB in total')
  })

  it('refuses a batch where only a later file is the wrong type', () => {
    expect(validateDocuments([file('a.pdf', 'application/pdf', MB), file('b.gif', 'image/gif', MB)]).ok).toBe(false)
  })
})

describe('documentFileName', () => {
  it('keeps the name as given, less path separators and control characters', () => {
    expect(documentFileName('สัญญา\u0000/เช่า.pdf', 'application/pdf')).toBe('สัญญาเช่า.pdf')
  })
  it('never stores a blank', () => {
    expect(documentFileName('  ', 'image/png')).toBe('document.png')
  })
  it('strips backslashes and every C0 control and DEL, keeping Thai as typed', () => {
    expect(documentFileName('..\\บัตร\u001f\u007f\tประชาชน.jpg', 'image/jpeg')).toBe('..บัตรประชาชน.jpg')
  })
  it('caps the stored name at 255 characters', () => {
    expect(documentFileName('ก'.repeat(300) + '.pdf', 'application/pdf')).toHaveLength(255)
  })
  // Only reachable for a name made entirely of stripped characters; the mime
  // type has already been validated by then, but the fallback must not throw.
  it('falls back to a generic name, .bin for an unknown type', () => {
    expect(documentFileName('/\\\u0000', 'application/pdf')).toBe('document.pdf')
    expect(documentFileName('', 'image/webp')).toBe('document.bin')
  })
})
