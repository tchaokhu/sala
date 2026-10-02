'use client'

// The write half of the Owners page — adding one, and nothing else for this
// cut. There is no edit and no delete yet, so a typo sits there until that
// follow-up ships.
//
// The form stays on the page: adding Owners is a run of them, and being thrown
// somewhere else after each one is the wrong end of the job.

import { Field, INPUT, Notice, PRIMARY_BUTTON, useFormAction } from '@/components/form'
import { createOwner } from './actions'
import { PANEL } from '@/components/styles'

export function CreateOwnerForm({ slug }: { slug: string }) {
  const [result, action, pending] = useFormAction(createOwner)

  return (
    <form action={action} className={`flex flex-col gap-4 ${PANEL}`}>
      <div>
        <h2 className="font-semibold">Add an Owner</h2>
        <p className="mt-1 text-sm text-muted">
          The person who owns a Property and entrusts it to you. Name and phone are needed — the
          number is what tells two Owners with the same name apart.
        </p>
      </div>

      {/* Names which Org to resolve. It is not where the Org comes from — the
          action reads that from the session through requireMember (ADR 0002). */}
      <input type="hidden" name="slug" value={slug} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required>
          <input
            type="text"
            name="name"
            required
            maxLength={200}
            disabled={pending}
            placeholder="e.g. Somchai Rattanakul"
            className={INPUT}
          />
        </Field>

        <Field label="Phone" required>
          <input
            type="tel"
            name="phone"
            required
            maxLength={40}
            disabled={pending}
            placeholder="081 234 5678"
            className={`${INPUT} tabular`}
          />
        </Field>

        <Field label="Email">
          <input type="email" name="email" maxLength={200} disabled={pending} className={INPUT} />
        </Field>

        <Field label="LINE ID">
          <input type="text" name="line_id" maxLength={100} disabled={pending} className={INPUT} />
        </Field>

        <Field label="Facebook link" wide>
          <input
            type="url"
            name="facebook_url"
            maxLength={2000}
            disabled={pending}
            placeholder="https://facebook.com/…"
            className={INPUT}
          />
        </Field>

        <Field label="Note" wide>
          <textarea
            name="note"
            rows={3}
            maxLength={2000}
            disabled={pending}
            placeholder="How they prefer to be contacted, who else to call"
            className={INPUT}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? 'Saving…' : 'Add Owner'}
        </button>
        <Notice result={result} />
      </div>
    </form>
  )
}
