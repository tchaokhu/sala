import { describe, expect, it } from 'vitest'
import PizZip from 'pizzip'
import { fillTemplate, readTemplateTags } from './docx-template'
import { EMPTY_TAG } from './template-tags'

/** The smallest DOCX docxtemplater accepts, one paragraph per entry. Each
 *  entry is a list of runs, so a tag split across runs can be built. */
function docx(paragraphs: string[][]): Uint8Array {
  const zip = new PizZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  )
  const body = paragraphs
    .map((runs) => `<w:p>${runs.map((t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`).join('')}</w:p>`)
    .join('')
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  )
  return zip.generate({ type: 'uint8array' })
}

const text = (bytes: Uint8Array) =>
  (new PizZip(bytes).file('word/document.xml')!.asText().match(/<w:t[^>]*>[^<]*<\/w:t>/g) ?? [])
    .map((t) => t.replace(/<[^>]+>/g, ''))
    .join('')

describe('readTemplateTags', () => {
  it('lists each tag once, in order, including one Word split across runs', () => {
    const r = readTemplateTags(docx([['ผู้เช่า {tenant_name} ห้อง {room', '_number}'], ['({tenant_name})']]))
    expect(r).toEqual({ ok: true, tags: ['tenant_name', 'room_number'] })
  })
  it('accepts a file with no tags', () => {
    expect(readTemplateTags(docx([['สัญญาเช่า ........']]))).toEqual({ ok: true, tags: [] })
  })
  it('refuses an unclosed tag and says so', () => {
    const r = readTemplateTags(docx([['{tenant_name ห้อง']]))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/tenant_name/)
  })
  it('refuses a Thai or spaced tag name', () => {
    const r = readTemplateTags(docx([['{ชื่อผู้เช่า}']]))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('English letters')
  })
  it('refuses a repeating section', () => {
    const r = readTemplateTags(docx([['{#inventory}{item}{/inventory}']]))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('not supported')
  })
  it('refuses bytes that are not a DOCX', () => {
    const r = readTemplateTags(new TextEncoder().encode('%PDF-1.7'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('Word (DOCX)')
  })
})

describe('fillTemplate', () => {
  it('fills known values and dots the rest', () => {
    const out = fillTemplate(docx([['ผู้เช่า {tenant_name} อายุ {tenant_age} ปี']]), { tenant_name: 'สมชาย & ลูก' })
    expect(text(out)).toBe(`ผู้เช่า สมชาย &amp; ลูก อายุ ${EMPTY_TAG} ปี`)
  })
})
