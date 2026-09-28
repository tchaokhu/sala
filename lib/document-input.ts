// What the Rental Documents upload decides, with no I/O in it — the form runs
// it before submitting as a courtesy, the action runs it on what arrived as the
// control, and the bucket's own limits (0002_storage.sql) are the backstop
// (ADR 0007).
//
// No message here names a file. A filename can be a Tenant's name and the word
// for ID card, and Tenants' identity documents never reach a message
// (CLAUDE.md). The person knows which files they chose.

import { fail, mb, type FormLike, type Parsed } from './property-input'

export const DOCUMENT_KINDS = [
  'contract',
  'id_copy',
  'transfer_slip',
  'inspection',
  'receipt',
  'other',
] as const
export type RentalDocumentKind = (typeof DOCUMENT_KINDS)[number]

export const DOCUMENT_KIND_LABELS: Record<RentalDocumentKind, string> = {
  contract: 'Contract',
  id_copy: 'ID copy',
  transfer_slip: 'Transfer slip',
  inspection: 'Inspection',
  receipt: 'Receipt',
  other: 'Other',
}

export function isDocumentKind(value: unknown): value is RentalDocumentKind {
  return typeof value === 'string' && (DOCUMENT_KINDS as readonly string[]).includes(value)
}

export function parseDocumentKind(form: FormLike): Parsed<RentalDocumentKind> {
  const kind = form.get('kind')
  if (!isDocumentKind(kind)) {
    return fail(
      `Choose what kind of document this is — ${DOCUMENT_KINDS.map((k) => DOCUMENT_KIND_LABELS[k]).join(', ')}`,
    )
  }
  return { ok: true, values: kind }
}

/** Exactly the `sala-docs` bucket's allowed_mime_types, each with the
 *  extension its Storage key gets. The key never reuses the uploaded name. */
export const ACCEPTED_DOCUMENT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

export function documentExtension(mime: string): string | null {
  return ACCEPTED_DOCUMENT_TYPES[mime] ?? null
}

/** The bucket's file_size_limit. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
/** One submission is one request body, and next.config.ts caps that at 24 MB
 *  (ADR 0007). The two move together. */
export const MAX_DOCUMENTS_TOTAL_BYTES = 20 * 1024 * 1024

export const MAX_FILE_NAME = 255

interface FileLike {
  size: number
  type: string
}

export function validateDocuments(files: FileLike[]): Parsed<null> {
  if (files.length === 0) return fail('Choose at least one file to upload')

  for (const file of files) {
    if (!documentExtension(file.type)) {
      return fail('Documents must be PDF, Word (DOCX), JPG or PNG files')
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      return fail(`Each file must be under ${mb(MAX_DOCUMENT_BYTES)} MB`)
    }
  }

  const total = files.reduce((sum, f) => sum + f.size, 0)
  if (total > MAX_DOCUMENTS_TOTAL_BYTES) {
    return fail(
      `One upload must come to under ${mb(MAX_DOCUMENTS_TOTAL_BYTES)} MB in total ` +
        `— these come to ${mb(total)} MB. Upload them in smaller batches.`,
    )
  }

  return { ok: true, values: null }
}

/** What is kept in `file_name`, for display and as the download name only. */
export function documentFileName(name: string, mime: string): string {
  const cleaned = name.replace(/[\u0000-\u001f\u007f/\\]/g, '').trim().slice(0, MAX_FILE_NAME)
  return cleaned || `document.${documentExtension(mime) ?? 'bin'}`
}
