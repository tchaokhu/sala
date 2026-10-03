// Rental Documents: the bucket, the reads, the sweep and the signed URLs.
//
// The same rules as Property photos (ADR 0007, amended): bytes move only inside
// a Server Action on the caller's session, keys are
// `{org_id}/rentals/{rental_id}/{document_id}.{ext}`, and the uploaded filename
// lives only in `file_name`. Nothing here logs a filename — it can be a
// Tenant's name and the word for ID card. A Document is named by its id.

import 'server-only'
import { createClient } from './supabase-server'
import { SIGNED_URL_TTL_SECONDS } from './property-storage'
import { documentExtension, documentFileName, type RentalDocumentKind } from './document-input'

export const DOCS_BUCKET = 'sala-docs'

type Client = Awaited<ReturnType<typeof createClient>>

export interface RentalDocument {
  id: string
  rentalId: string
  kind: RentalDocumentKind
  fileName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  /** The key signedDocumentUrls is keyed by. Carries no filename. */
  storagePath: string
}

export interface EarlierRentalDocument extends RentalDocument {
  rentalStartDate: string
  rentalEndDate: string
}

export interface RentalDocuments {
  own: RentalDocument[]
  /** Documents of earlier Rentals with the same Property and Tenant — the chain
   *  Renew produces. Read-only on this Rental's page. */
  earlier: EarlierRentalDocument[]
  /** More than RENTAL_DOCUMENTS_LIMIT across the chain; the page says so. */
  capped: boolean
}

export const RENTAL_DOCUMENTS_LIMIT = 200

interface DocumentRecord {
  id: string
  rental_id: string
  kind: RentalDocumentKind
  file_name: string
  mime_type: string
  size_bytes: number
  created_at: string
  storage_path: string
  rentals: { start_date: string; end_date: string } | { start_date: string; end_date: string }[] | null
}

/**
 * A Rental's own Documents, then its predecessors'. Two round-trips, because
 * the second depends on the first: the chain is keyed by the Rental's
 * property_id, tenant_id and start_date, and PostgREST cannot correlate an
 * embed to its parent's columns. The second query reads own and earlier
 * together — `start_date <= this one's` includes the Rental itself — and they
 * are split here.
 *
 * Another Org's Rental and a missing one both give empty lists.
 */
export async function listRentalDocuments(orgId: string, rentalId: string): Promise<RentalDocuments> {
  const supabase = await createClient()

  const { data: rental, error: rentalError } = await supabase
    .from('rentals')
    .select('property_id, tenant_id, start_date')
    .eq('id', rentalId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (rentalError) throw rentalError
  if (!rental) return { own: [], earlier: [], capped: false }

  const r = rental as { property_id: string; tenant_id: string | null; start_date: string }

  let query = supabase
    .from('rental_documents')
    .select(
      'id, rental_id, kind, file_name, mime_type, size_bytes, created_at, storage_path, ' +
        'rentals!inner(start_date, end_date)',
    )
    .eq('org_id', orgId)
  query = r.tenant_id
    ? query
        .eq('rentals.property_id', r.property_id)
        .eq('rentals.tenant_id', r.tenant_id)
        .lte('rentals.start_date', r.start_date)
    : query.eq('rental_id', rentalId)

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(RENTAL_DOCUMENTS_LIMIT + 1)
  if (error) throw error

  const records = (data ?? []) as unknown as DocumentRecord[]
  const own: RentalDocument[] = []
  const earlier: EarlierRentalDocument[] = []
  for (const d of records.slice(0, RENTAL_DOCUMENTS_LIMIT)) {
    const doc: RentalDocument = {
      id: d.id,
      rentalId: d.rental_id,
      kind: d.kind,
      fileName: d.file_name,
      mimeType: d.mime_type,
      sizeBytes: Number(d.size_bytes),
      createdAt: d.created_at,
      storagePath: d.storage_path,
    }
    if (d.rental_id === rentalId) {
      own.push(doc)
      continue
    }
    const parent = Array.isArray(d.rentals) ? d.rentals[0] : d.rentals
    earlier.push({ ...doc, rentalStartDate: parent?.start_date ?? '', rentalEndDate: parent?.end_date ?? '' })
  }
  // Newest predecessor first, each Rental's Documents together.
  earlier.sort((a, b) => b.rentalStartDate.localeCompare(a.rentalStartDate))

  return { own, earlier, capped: records.length > RENTAL_DOCUMENTS_LIMIT }
}

export interface SignedDocumentUrl {
  /** Opens in the browser (PDF, images). null when it could not be signed. */
  url: string | null
  /** The same object served as an attachment under its original name. */
  downloadUrl: string | null
}

/**
 * Signed URLs for Documents, keyed by storage path, one batched call.
 *
 * `createSignedUrls`' own `download` option is one name for the whole batch,
 * so it cannot carry each file's original name. The `download` parameter sits
 * outside the signed token — storage-js appends it to the URL after signing —
 * so it is appended here per file instead, which gives Open and Download from
 * the same call.
 *
 * A Storage failure gives nulls, not a thrown page: the rest of the Rental page
 * is still worth having. The detail goes to the log; it carries paths, which
 * carry no filename.
 */
export async function signedDocumentUrls(
  docs: Pick<RentalDocument, 'storagePath' | 'fileName'>[],
): Promise<Record<string, SignedDocumentUrl>> {
  const out: Record<string, SignedDocumentUrl> = {}
  for (const d of docs) out[d.storagePath] = { url: null, downloadUrl: null }
  if (docs.length === 0) return out

  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from(DOCS_BUCKET)
    .createSignedUrls(
      docs.map((d) => d.storagePath),
      SIGNED_URL_TTL_SECONDS,
    )
  if (error || !data) {
    console.error('[rental-documents] could not sign document urls:', error)
    return out
  }

  const signed = new Map<string, string>()
  for (const entry of data) {
    if (entry.path && entry.signedUrl && !entry.error) signed.set(entry.path, entry.signedUrl)
  }
  for (const d of docs) {
    const url = signed.get(d.storagePath)
    if (url) out[d.storagePath] = { url, downloadUrl: `${url}&download=${encodeURIComponent(d.fileName)}` }
  }
  return out
}

/** Best-effort removal of objects no row points at. Logged and swallowed: the
 *  person's answer is already decided. */
export async function discardDocuments(supabase: Client, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  try {
    const { error } = await supabase.storage.from(DOCS_BUCKET).remove(paths)
    if (error) throw error
  } catch (err) {
    console.error('[rental-documents] could not remove orphaned uploads:', err)
  }
}

/**
 * Upload Documents to a Rental and record them: ADR 0007 applied to
 * `sala-docs` — every key minted first, the bytes up on the caller's session,
 * the rows written last so none can point at bytes that never arrived, and
 * every intended key swept if either step fails. The caller has already
 * established Membership and that the Rental is the Org's; it says what went
 * wrong, since only it knows how to put it to the person.
 */
export async function attachDocuments(
  supabase: Client,
  doc: { orgId: string; rentalId: string; kind: RentalDocumentKind; files: File[]; userId: string | null },
): Promise<{ ok: true; count: number } | { ok: false; stage: 'upload' | 'save'; error: unknown }> {
  // The key's extension comes from the validated mime type, never the filename.
  const rows = doc.files.map((file) => {
    const id = crypto.randomUUID()
    return {
      file,
      row: {
        id,
        org_id: doc.orgId,
        rental_id: doc.rentalId,
        kind: doc.kind,
        storage_path: `${doc.orgId}/rentals/${doc.rentalId}/${id}.${documentExtension(file.type)}`,
        file_name: documentFileName(file.name, file.type),
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: doc.userId,
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
  } catch (error) {
    // Promise.all rejects on the first failure while others may still land, so
    // the sweep names every intended key, not what resolved.
    await discardDocuments(supabase, paths)
    return { ok: false, stage: 'upload', error }
  }

  const { error } = await supabase.from('rental_documents').insert(rows.map((r) => r.row))
  if (error) {
    await discardDocuments(supabase, paths)
    return { ok: false, stage: 'save', error }
  }
  return { ok: true, count: rows.length }
}
