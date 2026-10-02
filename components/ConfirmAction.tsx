'use client'

// Every delete in Sala asks first, in a dialog.
//
// One component so there is one pattern: a trigger, then a centred box over a
// dimmed page that says what will be destroyed — with the number where there is
// one (CLAUDE.md) — and a Confirm next to Cancel. Cancel has the focus, so
// Enter on an accidental open does nothing destructive. Escape and the backdrop
// cancel too, unless the action is already running.
//
// It submits through onSubmit + startTransition rather than `action=`, so React
// does not reset the form under it (see PostingChecklist). A successful answer
// closes the dialog and is shown beside the trigger; an action that redirects
// simply navigates away.

import { startTransition, useEffect, useRef, useState } from 'react'
import { Dialog } from '@/components/Dialog'
import { BUTTON, Notice, useFormAction } from '@/components/form'
import type { ActionResult } from '@/lib/action-result'
import { WARN_BUTTON } from '@/components/styles'

export const DELETE_TRIGGER =
  'inline-flex w-fit items-center gap-1.5 whitespace-nowrap text-sm text-muted transition-colors hover:text-warn'

export function ConfirmAction({
  action,
  fields,
  trigger,
  triggerClassName = DELETE_TRIGGER,
  triggerLabel,
  title,
  children,
  confirmLabel = 'Delete',
  pendingLabel = 'Deleting…',
}: {
  action: (formData: FormData) => Promise<ActionResult>
  /** Hidden inputs the action reads. Never an org_id (CLAUDE.md). */
  fields: Record<string, string>
  trigger: React.ReactNode
  triggerClassName?: string
  /** For screen readers when the trigger is only an icon and a short word. */
  triggerLabel?: string
  title: string
  /** What it destroys, in a sentence or two. */
  children: React.ReactNode
  confirmLabel?: string
  pendingLabel?: string
}) {
  const [result, run, pending] = useFormAction(action)
  const [open, setOpen] = useState(false)
  // The answer on screen when the dialog was opened. A new successful answer
  // closes it; a refusal keeps it open, where it can be read.
  const [baseline, setBaseline] = useState<ActionResult | null>(null)
  const shown = open && !(result?.ok && result !== baseline)
  const cancelRef = useRef<HTMLButtonElement>(null)

  function openDialog() {
    setBaseline(result)
    setOpen(true)
  }

  useEffect(() => {
    if (shown) cancelRef.current?.focus()
  }, [shown])

  return (
    <>
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={openDialog}
          aria-label={triggerLabel}
          className={triggerClassName}
        >
          {trigger}
        </button>
        {!shown && result?.ok && <Notice result={result} />}
      </span>

      <Dialog open={shown} onClose={() => setOpen(false)} label={title} role="alertdialog" busy={pending}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const formData = new FormData(e.currentTarget)
            startTransition(() => run(formData))
          }}
          className="pointer-events-auto flex w-full max-w-md flex-col gap-3 rounded-xl border border-warn/40 bg-surface p-5 text-left text-ink"
        >
          <h2 className="font-semibold">{title}</h2>
          <div className="flex flex-col gap-2 text-sm">{children}</div>
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              ref={cancelRef}
              type="button"
              disabled={pending}
              onClick={() => setOpen(false)}
              className={BUTTON}
            >
              Cancel
            </button>
            <button type="submit" disabled={pending} className={WARN_BUTTON}>
              {pending ? pendingLabel : confirmLabel}
            </button>
          </div>
          {result && !result.ok && <Notice result={result} />}
        </form>
      </Dialog>
    </>
  )
}
