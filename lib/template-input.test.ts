import { describe, expect, it } from 'vitest'
import { parseTemplateForm, TEMPLATE_CATEGORIES, validateTemplateFiles } from './template-input'

const MB = 1024 * 1024
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const form = (values: Record<string, unknown>) => ({ get: (n: string) => values[n] ?? null })

describe('parseTemplateForm', () => {
  it('accepts every category with a trimmed title', () => {
    for (const category of TEMPLATE_CATEGORIES) {
      expect(parseTemplateForm(form({ category, title: '  สัญญาเช่า  ' }))).toEqual({
        ok: true,
        values: { category, title: 'สัญญาเช่า' },
      })
    }
  })
  it.each([null, '', 'contract'])('refuses category %j', (category) => {
    expect(parseTemplateForm(form({ category, title: 'x' })).ok).toBe(false)
  })
  it('refuses a blank or overlong title', () => {
    expect(parseTemplateForm(form({ category: 'other', title: '   ' })).ok).toBe(false)
    expect(parseTemplateForm(form({ category: 'other', title: 'x'.repeat(121) })).ok).toBe(false)
  })
})

describe('validateTemplateFiles', () => {
  it('takes PDF and DOCX', () => {
    expect(validateTemplateFiles([{ type: 'application/pdf', size: MB }, { type: DOCX, size: MB }]).ok).toBe(true)
  })
  it('refuses images, nothing, and too much', () => {
    expect(validateTemplateFiles([{ type: 'image/png', size: MB }]).ok).toBe(false)
    expect(validateTemplateFiles([]).ok).toBe(false)
    expect(validateTemplateFiles([{ type: 'application/pdf', size: 21 * MB }]).ok).toBe(false)
    expect(validateTemplateFiles([{ type: 'application/pdf', size: 11 * MB }, { type: DOCX, size: 11 * MB }]).ok).toBe(false)
  })
})
