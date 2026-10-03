'use client'

// The fill form: what to fill from, one field per tag in the file, and the
// two downloads. Choosing a Property reloads the page with it in the URL, so
// the server reads its facts; the values typed here go to the file route and
// are kept nowhere.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { Combobox } from '@/components/Combobox'
import { useFeedback } from '@/components/Feedback'
import { BUTTON, Field, INPUT, PRIMARY_BUTTON } from '@/components/form'
import { PANEL } from '@/components/styles'
import { EMPTY_TAG } from '@/lib/template-tags'
import type { FillChoice } from '@/lib/template-source'

export interface FillField {
  tag: string
  label: string
  value: string
}

/** The download's name, from the header the route set. */
function fileNameOf(res: Response, fallback: string): string {
  const m = /filename\*=UTF-8''([^;]+)/.exec(res.headers.get('Content-Disposition') ?? '')
  return m ? decodeURIComponent(m[1]) : fallback
}

export function FillForm({
  slug,
  templateId,
  fields,
  choices,
  capped,
  chosenPropertyId,
  rentalId,
  pdfReady,
}: {
  slug: string
  templateId: string
  fields: FillField[]
  choices: FillChoice[]
  capped: boolean
  chosenPropertyId: string | null
  rentalId: string | null
  pdfReady: boolean
}) {
  const router = useRouter()
  const feedback = useFeedback()
  const [pending, setPending] = useState<'docx' | 'pdf' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const base = `/o/${slug}/templates/${templateId}/fill`

  async function download(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const format = submitter?.value === 'pdf' ? 'pdf' : 'docx'
    const body = new FormData(e.currentTarget)
    body.set('format', format)
    setPending(format)
    setError(null)
    feedback?.begin(format === 'pdf' ? 'Making the PDF' : 'Filling the template')
    try {
      const res = await fetch(`/o/${slug}/templates/${templateId}/file`, { method: 'POST', body })
      if (!res.ok) {
        setError(await res.text())
        return
      }
      const name = fileNameOf(res, `document.${format}`)
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
      feedback?.toast({ message: format === 'pdf' ? 'PDF downloaded' : 'Word file downloaded', detail: name })
    } catch {
      setError('The download did not finish — check the connection and try again.')
    } finally {
      setPending(null)
      feedback?.end()
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className={`flex flex-col gap-3 ${PANEL}`}>
        <div>
          <h2 className="font-semibold">Fill from</h2>
          <p className="mt-1 text-sm text-muted">
            A Property fills its Building and Owner, and its active Rental’s Tenant, term and money. Leave it
            empty to type everything.
          </p>
        </div>
        {rentalId ? (
          <p className="text-sm">
            Filled from{' '}
            <Link href={`/o/${slug}/rentals/${rentalId}`} className="text-accent underline-offset-4 hover:underline">
              this Rental
            </Link>
            .{' '}
            <Link href={base} className="text-muted underline-offset-4 hover:text-ink hover:underline">
              Choose another
            </Link>
          </p>
        ) : (
          <div className="max-w-xl">
            <Combobox
              items={choices.map((c) => ({
                id: c.id,
                label: c.title,
                // ETL rooms share titles; the room number tells them apart.
                sub: [c.roomNumber && `Room ${c.roomNumber}`, c.tenantName ? `Rented to ${c.tenantName}` : 'No active Rental']
                  .filter(Boolean)
                  .join(' · '),
              }))}
              idName="property_id"
              initialId={chosenPropertyId}
              placeholder="Type to search the Properties"
              listLabel="Show the Property list"
              clearLabel="Fill from nothing"
              emptyNote={(text) => <>No Property matches “<span className="text-ink">{text}</span>”.</>}
              cappedNote={capped && `Showing the first ${choices.length} Properties`}
              onChoose={(id) => router.replace(id ? `${base}?property=${id}` : base, { scroll: false })}
            />
          </div>
        )}
      </section>

      <form onSubmit={download} className={`flex flex-col gap-4 ${PANEL}`}>
        <div>
          <h2 className="font-semibold">Values</h2>
          <p className="mt-1 text-sm text-muted">
            Change anything for this file only — nothing here is saved. A field left empty prints as{' '}
            <span className="font-mono">{EMPTY_TAG}</span>
          </p>
        </div>

        {fields.length === 0 ? (
          <p className="text-sm text-muted">
            This template has no tags yet, so it downloads as it is. See “Tags you can use” on{' '}
            <Link href={`/o/${slug}/templates/new`} className="text-accent underline-offset-4 hover:underline">
              Add Template
            </Link>
            .
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => (
              <Field key={f.tag} label={f.label} hint={`{${f.tag}}`}>
                <input name={`t.${f.tag}`} defaultValue={f.value} maxLength={500} disabled={pending !== null} className={INPUT} />
              </Field>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" value="docx" disabled={pending !== null} className={`${PRIMARY_BUTTON} inline-flex items-center gap-1.5`}>
            <Download size={14} aria-hidden />
            {pending === 'docx' ? 'Filling…' : 'Download Word'}
          </button>
          <button
            type="submit"
            value="pdf"
            disabled={pending !== null || !pdfReady}
            className={`${BUTTON} inline-flex items-center gap-1.5`}
          >
            <FileText size={14} aria-hidden />
            {pending === 'pdf' ? 'Making the PDF…' : 'Download PDF'}
          </button>
          {!pdfReady && <span className="text-xs text-muted">PDF is not set up on this server yet.</span>}
          {error && (
            <p role="status" className="text-sm text-warn">
              {error}
            </p>
          )}
        </div>
      </form>
    </div>
  )
}
