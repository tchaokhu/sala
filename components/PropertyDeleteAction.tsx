'use client'

// Deleting a Property straight from the list row. A confirm dialog rather
// than an inline row expansion — the same overlay-and-centered-box shape as
// PhotoLightbox, so a Property list ends up with one modal pattern, not two.
// It posts to the same deleteProperty action the edit page's PropertyDeleteForm
// uses; the list is already where that action redirects on success, so a
// delete started here lands back on the same row it removed.
//
// It cannot name a photo count the way the edit page's version does — the
// list query deliberately does not select the images array (lib/properties.ts:
// "a list row does not need a Property's... image array"), and adding it back
// just for this warning would cost every row on every page load to save one
// line of text on the rare row somebody deletes.

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { BUTTON, Notice, useFormAction } from '@/components/form'
import { deleteProperty } from '@/app/o/[slug]/properties/[id]/actions'

export function PropertyDeleteAction({
  slug,
  propertyId,
  title,
}: {
  slug: string
  propertyId: string
  title: string
}) {
  const [result, action, pending] = useFormAction(deleteProperty)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pending) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, pending])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Delete ${title}`}
        className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted transition-colors hover:text-warn"
      >
        <Trash2 size={14} aria-hidden />
        Delete
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Cancel"
            disabled={pending}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/70"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Delete ${title}`}
            className="pointer-events-none absolute inset-0 grid place-items-center p-6"
          >
            <form
              action={action}
              className="pointer-events-auto flex w-full max-w-sm flex-col gap-3 rounded-xl border border-warn/40 bg-surface p-4"
            >
              <p className="text-sm">
                Delete <span className="font-semibold">{title}</span>? This cannot be undone.
              </p>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="property_id" value={propertyId} />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg border border-warn px-3 py-2 text-sm font-medium text-warn transition-colors hover:bg-warn/10 disabled:opacity-60"
                >
                  {pending ? 'Deleting…' : 'Confirm delete'}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setOpen(false)}
                  className={BUTTON}
                >
                  Cancel
                </button>
                <Notice result={result} />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
