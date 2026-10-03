// What the Document Templates upload and edit decide, with no I/O in it. The
// form runs it as a courtesy, the action runs it on what arrived, and the
// bucket's own limits (0002_storage.sql) are the backstop (ADR 0007).

import { fail, mb, type FormLike, type Parsed } from './property-input'
import { documentExtension, MAX_DOCUMENT_BYTES, MAX_DOCUMENTS_TOTAL_BYTES } from './document-input'

/** The `document_category` enum (0001). */
export const TEMPLATE_CATEGORIES = ['rental_contract', 'agency_contract', 'receipt', 'other'] as const
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  rental_contract: 'Rental contract',
  agency_contract: 'Agency contract',
  receipt: 'Receipt',
  other: 'Other',
}

/** A template is something to fill in, so a scan is not one: PDF and Word. */
export const ACCEPTED_TEMPLATE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export const MAX_TEMPLATE_TITLE = 120

export function parseTemplateForm(form: FormLike): Parsed<{ category: TemplateCategory; title: string }> {
  const category = form.get('category')
  if (typeof category !== 'string' || !(TEMPLATE_CATEGORIES as readonly string[]).includes(category)) {
    return fail(`Choose a category — ${TEMPLATE_CATEGORIES.map((c) => TEMPLATE_CATEGORY_LABELS[c]).join(', ')}`)
  }
  const raw = form.get('title')
  const title = typeof raw === 'string' ? raw.trim() : ''
  if (!title) return fail('Give the template a title')
  if (title.length > MAX_TEMPLATE_TITLE) return fail(`Keep the title under ${MAX_TEMPLATE_TITLE} characters`)
  return { ok: true, values: { category: category as TemplateCategory, title } }
}

export function validateTemplateFiles(files: { size: number; type: string }[]): Parsed<null> {
  if (files.length === 0) return fail('Choose at least one file to upload')
  for (const file of files) {
    if (!ACCEPTED_TEMPLATE_TYPES.includes(file.type) || !documentExtension(file.type)) {
      return fail('Templates must be PDF or Word (DOCX) files')
    }
    if (file.size > MAX_DOCUMENT_BYTES) return fail(`Each file must be under ${mb(MAX_DOCUMENT_BYTES)} MB`)
  }
  const total = files.reduce((sum, f) => sum + f.size, 0)
  if (total > MAX_DOCUMENTS_TOTAL_BYTES) {
    return fail(`One upload must come to under ${mb(MAX_DOCUMENTS_TOTAL_BYTES)} MB in total — these come to ${mb(total)} MB`)
  }
  return { ok: true, values: null }
}
