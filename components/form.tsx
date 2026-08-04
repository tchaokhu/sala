'use client'

// The things every form in Sala repeats: the field styling, the pending button,
// the one line of copy a Server Action answers with, and the Card/Field pair a
// long form is grouped into.
//
// They started in app/o/[slug]/settings/settings-forms.tsx. The Property form is
// the second caller, which is the point at which a copy becomes two things to
// keep in step — so they live here instead. Card and Field arrived the same way,
// from the add-a-Property form, once editing one needed the same sections.

import { useActionState } from 'react'
import type { ActionResult } from '@/lib/action-result'

export const INPUT =
  'rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60'

export const BUTTON =
  'rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:text-ink disabled:opacity-60'

/** The one filled button on a page — the action the person came to take. Teak,
 *  which is the accent and never a status (CLAUDE.md). */
export const PRIMARY_BUTTON =
  'rounded-lg border border-accent bg-accent px-3 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60'

/** `useActionState` with the signature every action here has: FormData in, an
 *  ActionResult out, and nothing carried over from the previous attempt. */
export function useFormAction(action: (formData: FormData) => Promise<ActionResult>) {
  return useActionState(
    async (_previous: ActionResult | null, formData: FormData) => action(formData),
    null,
  )
}

/** What the action said. `role="status"` so a screen reader hears it without
 *  the focus moving, and the tone is semantic — never the accent. */
export function Notice({ result }: { result: ActionResult | null }) {
  if (!result) return null
  return (
    <p role="status" className={`text-sm ${result.ok ? 'text-ok' : 'text-warn'}`}>
      {result.message}
    </p>
  )
}

/** One titled section of a long form. A form of twenty inputs reads as three
 *  groups rather than one wall. */
export function Card({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {note && <p className="mt-1 text-sm text-muted">{note}</p>}
      </div>
      {children}
    </section>
  )
}

export function Field({
  label,
  hint,
  required,
  wide,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  /** Spans the whole grid — for the fields nobody wants a narrow box for. */
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${wide ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
      <span className="text-sm font-medium">
        {label}
        {required && <span className="ml-1 text-warn">*</span>}
      </span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  )
}
