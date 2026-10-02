'use client'

// The one modal pattern: a dimmed page, a centred box, Escape and the backdrop
// close it — unless `busy`, while an action is running.
//
// Portalled to <body>: a trigger often sits in a table's sticky Manage cell,
// and a sticky cell is its own stacking context, so a dialog drawn inside it
// would be painted under the rows that follow.
//
// The box itself is the caller's — `children` carries `pointer-events-auto`,
// so a click beside it falls through to the backdrop.

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export function Dialog({
  open,
  onClose,
  label,
  role = 'dialog',
  busy = false,
  closeLabel = 'Cancel',
  children,
}: {
  open: boolean
  onClose: () => void
  /** What a screen reader announces — usually the heading. */
  label: string
  /** `alertdialog` when it asks before destroying something. */
  role?: 'dialog' | 'alertdialog'
  busy?: boolean
  closeLabel?: string
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 text-left text-ink">
      <button
        type="button"
        aria-label={closeLabel}
        tabIndex={-1}
        disabled={busy}
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div
        role={role}
        aria-modal="true"
        aria-label={label}
        className="pointer-events-none absolute inset-0 grid place-items-center overflow-y-auto p-6"
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
