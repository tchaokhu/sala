'use client'

// The Document Templates table, with Edit and Delete on each file, and the
// upload form under it. The actions check everything again; the checks here
// only save a round-trip that would fail.

import Link from 'next/link'
import { startTransition, useState } from 'react'
import { Download, ExternalLink, FileText, Pencil, Trash2, Upload } from 'lucide-react'
import { BUTTON, Field, INPUT, Notice, PRIMARY_BUTTON, useFormAction } from '@/components/form'
import { ConfirmAction } from '@/components/ConfirmAction'
import { Dialog } from '@/components/Dialog'
import { TableFrame } from '@/components/TableFrame'
import { HEAD_CELL, PANEL, ROW_LINK } from '@/components/styles'
import { formatDateThai, formatSize } from '@/lib/format'
import { mb } from '@/lib/property-input'
import { MAX_DOCUMENTS_TOTAL_BYTES } from '@/lib/document-input'
import {
  ACCEPTED_TEMPLATE_TYPES,
  MAX_TEMPLATE_TITLE,
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_LABELS,
  validateTemplateFiles,
  type TemplateCategory,
} from '@/lib/template-input'
import { deleteTemplate, updateTemplate, uploadTemplates } from './actions'

export interface ShownTemplate {
  id: string
  category: TemplateCategory
  title: string
  fileName: string
  sizeBytes: number
  /** Bangkok date it was added, YYYY-MM-DD. */
  addedOn: string
  url: string | null
  downloadUrl: string | null
}

/** React resets a form once its `action=` settles; submitting by hand keeps
 *  what was typed on screen after a refusal. */
function submitWith(action: (formData: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(() => action(formData))
  }
}

/** The file type as a chip that can be found at a glance: its own colour, an
 *  outline and a fixed width, so a column of them lines up. */
function FileTypeChip({ name }: { name: string }) {
  const pdf = name.toLowerCase().endsWith('.pdf')
  return (
    <span
      className={`inline-flex w-14 shrink-0 items-center justify-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-semibold ${
        pdf ? 'border-pdf/50 bg-pdf/10 text-pdf' : 'border-word/50 bg-word/10 text-word'
      }`}
    >
      <FileText size={12} aria-hidden />
      {pdf ? 'PDF' : 'Word'}
    </span>
  )
}

export function TemplateLibrary({ slug, templates }: { slug: string; templates: ShownTemplate[] }) {
  if (templates.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">
        No templates yet.{' '}
        <Link href={`/o/${slug}/templates/new`} className="text-accent underline-offset-4 hover:underline">
          Add the first one
        </Link>{' '}
        — the PDF and its Word file can share one title.
      </p>
    )
  }
  return (
    <TableFrame
      minWidth="min-w-[44rem]"
      head={
        <>
          <th scope="col" className={HEAD_CELL}>Title</th>
          <th scope="col" className={HEAD_CELL}>Category</th>
          <th scope="col" className={HEAD_CELL}>File</th>
          <th scope="col" className={`${HEAD_CELL} text-right`}>Size</th>
          <th scope="col" className={HEAD_CELL}>Added</th>
          <th scope="col" className={`${HEAD_CELL} text-right`}>Manage</th>
        </>
      }
    >
      {templates.map((t) => (
        <TemplateRow key={t.id} slug={slug} template={t} />
      ))}
    </TableFrame>
  )
}

function TemplateRow({ slug, template: t }: { slug: string; template: ShownTemplate }) {
  return (
    <tr className="h-12 border-b border-border last:border-0">
      <td className="px-4 py-2 font-medium">{t.title}</td>
      <td className="whitespace-nowrap px-4 py-2 text-muted">{TEMPLATE_CATEGORY_LABELS[t.category]}</td>
      <td className="px-4 py-2">
        <span className="flex items-center gap-2">
          <FileTypeChip name={t.fileName} />
          <span className="block max-w-56 truncate text-muted" title={t.fileName}>
            {t.fileName}
          </span>
        </span>
      </td>
      <td className="tabular whitespace-nowrap px-4 py-2 text-right text-muted">{formatSize(t.sizeBytes)}</td>
      <td className="tabular whitespace-nowrap px-4 py-2 text-muted">{formatDateThai(t.addedOn)}</td>
      <td className="px-4 py-2">
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
          {t.url && t.downloadUrl ? (
            <>
              <a href={t.url} target="_blank" rel="noopener noreferrer" className={ROW_LINK}>
                <ExternalLink size={14} aria-hidden />
                Open
              </a>
              <a href={t.downloadUrl} className={ROW_LINK}>
                <Download size={14} aria-hidden />
                Download
              </a>
            </>
          ) : (
            <span className="whitespace-nowrap text-xs text-muted">Unavailable — reload the page</span>
          )}
          <EditTemplate slug={slug} template={t} />
          <ConfirmAction
            action={deleteTemplate}
            fields={{ slug, template_id: t.id }}
            triggerClassName={`${ROW_LINK} hover:text-warn`}
            triggerLabel={`Delete ${t.fileName}`}
            trigger={
              <>
                <Trash2 size={14} aria-hidden />
                Delete
              </>
            }
            title="Delete Document Template"
          >
            <p>
              Deletes &lsquo;<span className="font-semibold break-all">{t.fileName}</span>&rsquo; from{' '}
              {t.title}. It cannot be recovered. Other files under the same title stay.
            </p>
          </ConfirmAction>
        </div>
      </td>
    </tr>
  )
}

function EditTemplate({ slug, template: t }: { slug: string; template: ShownTemplate }) {
  const [open, setOpen] = useState(false)
  const [result, action, pending] = useFormAction(async (formData) => {
    const answer = await updateTemplate(formData)
    if (answer.ok) setOpen(false)
    return answer
  })

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={ROW_LINK} aria-label={`Edit ${t.fileName}`}>
        <Pencil size={14} aria-hidden />
        Edit
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} label="Edit Document Template" busy={pending}>
        <form
          onSubmit={submitWith(action)}
          className="pointer-events-auto flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-surface p-5"
        >
          <h2 className="font-semibold">Edit Document Template</h2>
          <p className="truncate text-sm text-muted" title={t.fileName}>{t.fileName}</p>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="template_id" value={t.id} />
          <CategoryAndTitle pending={pending} category={t.category} title={t.title} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" disabled={pending} onClick={() => setOpen(false)} className={BUTTON}>
              Cancel
            </button>
            <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
          <Notice result={result} />
        </form>
      </Dialog>
    </>
  )
}

function CategoryAndTitle({
  pending,
  category = 'rental_contract',
  title = '',
  titles,
}: {
  pending: boolean
  category?: TemplateCategory
  title?: string
  /** Existing titles, offered so a second file can join one. */
  titles?: string[]
}) {
  return (
    <>
      <Field label="Category" required>
        <select name="category" defaultValue={category} disabled={pending} className={INPUT}>
          {TEMPLATE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {TEMPLATE_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Title" required>
        <input
          name="title"
          defaultValue={title}
          required
          maxLength={MAX_TEMPLATE_TITLE}
          disabled={pending}
          list={titles ? 'template-titles' : undefined}
          className={INPUT}
        />
        {titles && (
          <datalist id="template-titles">
            {titles.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        )}
      </Field>
    </>
  )
}

/** The Add page's form. Success redirects to the list (with a toast). */
export function UploadForm({ slug, titles }: { slug: string; titles: string[] }) {
  const [files, setFiles] = useState<File[]>([])
  const [result, action, pending] = useFormAction(uploadTemplates, 'Uploading')

  const check = files.length > 0 ? validateTemplateFiles(files) : null

  return (
    <form onSubmit={submitWith(action)} className={`flex flex-col gap-4 ${PANEL}`}>
      <input type="hidden" name="slug" value={slug} />
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <CategoryAndTitle pending={pending} titles={titles} />
        <div className="sm:col-span-full">
          <Field
            label="Files"
            required
            hint={`PDF or Word; up to ${mb(MAX_DOCUMENTS_TOTAL_BYTES)} MB in total. Every file gets this title.`}
          >
            <input
              type="file"
              name="files"
              multiple
              required
              accept={ACCEPTED_TEMPLATE_TYPES.join(',')}
              disabled={pending}
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className={`${INPUT} file:mr-3 file:rounded file:border-0 file:bg-border file:px-2 file:py-1 file:text-sm file:text-ink`}
            />
          </Field>
        </div>
      </div>
      {check && !check.ok && (
        <p role="status" className="text-sm text-warn">
          {check.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || !check?.ok} className={`${PRIMARY_BUTTON} inline-flex items-center gap-1.5`}>
          <Upload size={14} aria-hidden />
          {pending ? 'Uploading…' : 'Upload'}
        </button>
        <Notice result={result} />
      </div>
    </form>
  )
}
