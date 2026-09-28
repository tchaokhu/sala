'use server'

import { revalidatePath } from 'next/cache'
import { createClient, currentUser, requireMember } from '@/lib/supabase-server'
import { cleanText } from '@/lib/validate'
import {
  documentExtension,
  documentFileName,
  parseDocumentKind,
  validateDocuments,
} from '@/lib/document-input'
import { DOCS_BUCKET, discardDocuments } from '@/lib/rental-documents'
import type { ActionResult } from '@/lib/action-result'

// Attaching and removing Rental Documents. ADR 0007 applied to `sala-docs`:
// Membership first and the Org from that gate (ADR 0002), bytes up on the
// caller's session, the rows written last; on delete the reverse — row first,
// then the object — so a row never points at bytes that are gone.
//
// These files are contracts and ID scans. Nothing below logs or returns a
// filename or anything about the Tenant; a Document is named by its id.

function failed(what: string, err: unknown): ActionResult {
  console.error(`[rental-documents] ${what}:`, err)
  return { ok: false, message: `${what} failed. Try again, and tell your administrator if it keeps failing.` }
}

const INCOMPLETE: ActionResult = { ok: false, message: 'The request was incomplete. Try again.' }
const RENTAL_NOT_FOUND: ActionResult = {
  ok: false,
  message: 'This Rental was not found — it may have been deleted. Go back to the Rentals list and try again.',
}
const DOCUMENT_NOT_FOUND: ActionResult = {
  ok: false,
  message: 'This Document was not found — it may already have been deleted. Reload the page.',
}

// Every Rental page, not just this one: a later Rental in the renewal chain
// lists this Rental's Documents under "From earlier Rentals".
function revalidateDocuments(slug: string) {
  revalidatePath('/o/[slug]/rentals/[id]', 'page')
  revalidatePath(`/o/${slug}/rentals`)
}

/** Fields: `slug`, `rental_id`, `kind`, `files` (one or more). */
export async function uploadRentalDocuments(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  const rentalId = cleanText(formData.get('rental_id'), 40)
  if (!slug || !rentalId) return INCOMPLETE

  // Before anything else, and before any file moves.
  const org = await requireMember(slug)

  const kind = parseDocumentKind(formData)
  if (!kind.ok) return kind

  const files = formData
    .getAll('files')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0)
  const valid = validateDocuments(files)
  if (!valid.ok) return valid

  const supabase = await createClient()

  // The id came from the form, so it is checked under the Org before a byte
  // moves. The caller's id rides along: both are independent reads.
  let found: boolean
  let userId: string | null
  try {
    ;[found, userId] = await Promise.all([
      supabase
        .from('rentals')
        .select('id')
        .eq('id', rentalId)
        .eq('org_id', org.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) throw error
          return data !== null
        }),
      currentUser().then((u) => u?.id ?? null),
    ])
  } catch (err) {
    return failed('Uploading the documents', err)
  }
  if (!found) return RENTAL_NOT_FOUND

  // Minted here so every key is known before any row exists. The key's
  // extension comes from the validated mime type, never from the filename.
  const rows = files.map((file) => {
    const id = crypto.randomUUID()
    return {
      file,
      row: {
        id,
        org_id: org.id,
        rental_id: rentalId,
        kind: kind.values,
        storage_path: `${org.id}/rentals/${rentalId}/${id}.${documentExtension(file.type)}`,
        file_name: documentFileName(file.name, file.type),
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: userId,
      },
    }
  })
  const paths = rows.map((r) => r.row.storage_path)

  try {
    await Promise.all(
      rows.map(async ({ file, row }) => {
        const { error } = await supabase.storage
          .from(DOCS_BUCKET)
          .upload(row.storage_path, file, { contentType: file.type, upsert: false })
        if (error) throw error
      }),
    )
  } catch (err) {
    // Promise.all rejects on the first failure while others may still land, so
    // the sweep names every intended key, not what resolved.
    await discardDocuments(supabase, paths)
    return failed('Uploading the documents', err)
  }

  const { error } = await supabase.from('rental_documents').insert(rows.map((r) => r.row))
  if (error) {
    await discardDocuments(supabase, paths)
    // The Rental was deleted between the check and the insert.
    if (error.code === '23503') return RENTAL_NOT_FOUND
    return failed('Saving the documents', error)
  }

  revalidateDocuments(slug)
  const n = rows.length
  return { ok: true, message: `${n} ${n === 1 ? 'document' : 'documents'} uploaded.` }
}

/** Fields: `slug`, `document_id`. */
export async function deleteRentalDocument(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  const documentId = cleanText(formData.get('document_id'), 40)
  if (!slug || !documentId) return INCOMPLETE

  const org = await requireMember(slug)
  const supabase = await createClient()

  // The row is deleted first and the path read back off it, never off the form.
  const { data, error } = await supabase
    .from('rental_documents')
    .delete()
    .eq('id', documentId)
    .eq('org_id', org.id)
    .select('storage_path')
    .maybeSingle()
  if (error) return failed('Deleting the document', error)
  if (!data) return DOCUMENT_NOT_FOUND

  // After the row is gone. A failure leaves an orphan for an operator to sweep
  // — logged by id, never by filename — and the person's answer stands.
  try {
    const { error: removeError } = await supabase.storage
      .from(DOCS_BUCKET)
      .remove([(data as { storage_path: string }).storage_path])
    if (removeError) throw removeError
  } catch (err) {
    console.error(`[rental-documents] document ${documentId} deleted, object not removed:`, err)
  }

  revalidateDocuments(slug)
  return { ok: true, message: 'Document deleted.' }
}
