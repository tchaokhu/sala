'use client'

// The three things every form in Sala repeats: the field styling, the pending
// button, and the one line of copy a Server Action answers with.
//
// They started in app/o/[slug]/settings/settings-forms.tsx. The Property form is
// the second caller, which is the point at which a copy becomes two things to
// keep in step — so they live here instead.

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
