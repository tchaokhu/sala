'use client'

// The Rental page's Documents: its own, with Delete on each, the upload form,
// and the read-only list of its predecessors'. The action checks the files
// again; validateDocuments here only saves a 20 MB round-trip that would fail.

import Link from 'next/link'
import { startTransition, useRef, useState } from 'react'
import { Download, ExternalLink, Trash2, Upload } from 'lucide-react'
import { BUTTON, Field, INPUT, Notice, useFormAction } from '@/components/form'
import { formatDateThai } from '@/lib/format'
import { mb } from '@/lib/property-input'
import {
  ACCEPTED_DOCUMENT_TYPES,
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABELS,
  MAX_DOCUMENTS_TOTAL_BYTES,
  validateDocuments,
  type RentalDocumentKind,
} from '@/lib/document-input'
import { deleteRentalDocument, uploadRentalDocuments } from './document-actions'
import { ConfirmAction } from '@/components/ConfirmAction'
import { TableFrame } from '@/components/TableFrame'
import { HEAD_CELL, PANEL } from '@/components/styles'

export interface ShownDocument {
  id: string
  kind: RentalDocumentKind
  fileName: string
  sizeBytes: number
  /** Bangkok date it was added, YYYY-MM-DD. */
  addedOn: string
  url: string | null
  downloadUrl: string | null
}

export interface EarlierDocument extends ShownDocument {
  rentalId: string
  rentalStartDate: string
  rentalEndDate: string
}


const ROW_LINK = 'inline-flex items-center gap-1.5 whitespace-nowrap text-muted transition-colors hover:text-ink'


/** React resets a form once its `action=` settles; submitting by hand keeps
 *  the chosen kind, and the armed confirmation, on screen after a refusal. */
function submitWith(action: (formData: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(() => action(formData))
  }
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${mb(bytes)} MB`
}

export function RentalDocuments({
  slug,
  rentalId,
  letElsewhere,
  own,
  earlier,
  capped,
}: {
  slug: string
  rentalId: string
  letElsewhere: boolean
  own: ShownDocument[]
  earlier: EarlierDocument[]
  capped: boolean
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">
        Documents <span className="tabular ml-1 text-sm font-normal text-muted">{own.length}</span>
      </h2>

      {own.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">
          {letElsewhere
            ? 'No Documents on this Rental. Upload one below if there is anything to keep.'
            : 'No Documents on this Rental yet. Upload the signed contract below, and the Tenant’s ID copy with it.'}
        </p>
      ) : (
        <DocumentsTable slug={slug} docs={own} />
      )}

      <UploadForm
        slug={slug}
        rentalId={rentalId}
        defaultKind={own.some((d) => d.kind === 'contract') ? 'other' : 'contract'}
      />

      {earlier.length > 0 && (
        <div className="mt-3 flex flex-col gap-3">
          <h3 className="font-semibold">
            From earlier Rentals{' '}
            <span className="tabular ml-1 text-sm font-normal text-muted">{earlier.length}</span>
          </h3>
          <p className="text-sm text-muted">
            Same Property and Tenant. To delete one, open the Rental it belongs to.
          </p>
          <DocumentsTable slug={slug} docs={earlier} earlier />
        </div>
      )}

      {capped && (
        <p className="text-xs text-warn">
          Showing the first {own.length + earlier.length} Documents across this Rental and the ones
          before it — there are more. Delete any that were uploaded twice.
        </p>
      )}
    </section>
  )
}

function DocumentsTable({
  slug,
  docs,
  earlier = false,
}: {
  slug: string
  docs: (ShownDocument | EarlierDocument)[]
  earlier?: boolean
}) {
  return (
    <TableFrame
      minWidth="min-w-[36rem]"
      head={
        <>
          <th scope="col" className={HEAD_CELL}>Kind</th>
          <th scope="col" className={HEAD_CELL}>Name</th>
          <th scope="col" className={`${HEAD_CELL} text-right`}>Size</th>
          {earlier && <th scope="col" className={HEAD_CELL}>Rental</th>}
          <th scope="col" className={HEAD_CELL}>Added</th>
          <th scope="col" className={`${HEAD_CELL} text-right`}>Manage</th>
        </>
      }
    >
      {docs.map((doc) => (
        <DocumentRow key={doc.id} slug={slug} doc={doc} />
      ))}
    </TableFrame>
  )
}

function DocumentRow({
  slug,
  doc,
}: {
  slug: string
  doc: ShownDocument | EarlierDocument
}) {
  const earlier = 'rentalId' in doc

  return (
    <>
      <tr className="h-12 border-b border-border last:border-0">
        <td className="whitespace-nowrap px-4 py-2">{DOCUMENT_KIND_LABELS[doc.kind]}</td>
        <td className="px-4 py-2">
          <span className="block max-w-56 truncate" title={doc.fileName}>
            {doc.fileName}
          </span>
        </td>
        <td className="tabular whitespace-nowrap px-4 py-2 text-right text-muted">{formatSize(doc.sizeBytes)}</td>
        {earlier && (
          <td className="tabular whitespace-nowrap px-4 py-2">
            <Link href={`/o/${slug}/rentals/${doc.rentalId}`} className="text-muted underline-offset-4 hover:text-ink hover:underline">
              {formatDateThai(doc.rentalStartDate)} – {formatDateThai(doc.rentalEndDate)}
            </Link>
          </td>
        )}
        <td className="tabular whitespace-nowrap px-4 py-2 text-muted">{formatDateThai(doc.addedOn)}</td>
        <td className="px-4 py-2">
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
            {doc.url && doc.downloadUrl ? (
              <>
                <a href={doc.url} target="_blank" rel="noopener noreferrer" className={ROW_LINK}>
                  <ExternalLink size={14} aria-hidden />
                  Open
                </a>
                <a href={doc.downloadUrl} className={ROW_LINK}>
                  <Download size={14} aria-hidden />
                  Download
                </a>
              </>
            ) : (
              <span className="whitespace-nowrap text-xs text-muted">Unavailable — reload the page</span>
            )}
            {!earlier && (
              <ConfirmAction
                action={deleteRentalDocument}
                fields={{ slug, document_id: doc.id }}
                triggerClassName={`${ROW_LINK} hover:text-warn`}
                triggerLabel={`Delete ${doc.fileName}`}
                trigger={
                  <>
                    <Trash2 size={14} aria-hidden />
                    Delete
                  </>
                }
                title="Delete Rental Document"
              >
                <p>
                  Deletes &lsquo;<span className="font-semibold break-all">{doc.fileName}</span>&rsquo;
                  ({DOCUMENT_KIND_LABELS[doc.kind]}). It cannot be recovered.
                </p>
              </ConfirmAction>
            )}
          </div>
        </td>
      </tr>
    </>
  )
}

function UploadForm({
  slug,
  rentalId,
  defaultKind,
}: {
  slug: string
  rentalId: string
  defaultKind: RentalDocumentKind
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [result, action, pending] = useFormAction(async (formData) => {
    const answer = await uploadRentalDocuments(formData)
    if (answer.ok) {
      if (inputRef.current) inputRef.current.value = ''
      setFiles([])
    }
    return answer
  })

  const check = files.length > 0 ? validateDocuments(files) : null
  const total = files.reduce((sum, f) => sum + f.size, 0)

  return (
    <form
      onSubmit={submitWith(action)}
      className={`flex flex-col gap-4 ${PANEL}`}
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="rental_id" value={rentalId} />

      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <Field label="Kind" required hint="Every file in one upload gets this kind">
          <select name="kind" defaultValue={defaultKind} disabled={pending} className={INPUT}>
            {DOCUMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {DOCUMENT_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Files"
          required
          hint={`PDF, Word, JPEG or PNG; up to ${mb(MAX_DOCUMENTS_TOTAL_BYTES)} MB in total per upload`}
        >
          <input
            ref={inputRef}
            type="file"
            name="files"
            multiple
            required
            accept={Object.keys(ACCEPTED_DOCUMENT_TYPES).join(',')}
            disabled={pending}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className={`${INPUT} file:mr-3 file:rounded file:border-0 file:bg-border file:px-2 file:py-1 file:text-sm file:text-ink`}
          />
        </Field>
      </div>

      {check && !check.ok && (
        <p role="status" className="text-sm text-warn">
          {check.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || !check?.ok}
          className={`${BUTTON} inline-flex items-center gap-1.5`}
        >
          <Upload size={14} aria-hidden />
          {pending ? 'Uploading…' : 'Upload'}
        </button>
        {files.length > 0 && (
          <span className="tabular text-sm text-muted">
            {files.length} {files.length === 1 ? 'file' : 'files'}, {formatSize(total)}
          </span>
        )}
        <Notice result={result} />
      </div>
    </form>
  )
}
