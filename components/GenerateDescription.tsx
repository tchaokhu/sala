'use client'

// "Generate" beside a Property's Description: writes the listing text from the
// fields on screen (lib/property-description.ts). Nothing is saved until the
// form is. Text already in the box is asked about first, in the one Dialog.

import { useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { describeProperty } from '@/lib/property-description'
import { BUTTON } from './styles'
import { Dialog } from './Dialog'

export function GenerateDescription({
  buildingName,
  disabled,
}: {
  /** The chosen Building's Thai name — the project the listing names. */
  buildingName: string | null
  disabled?: boolean
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [asking, setAsking] = useState(false)

  const box = () => ref.current?.form?.elements.namedItem('description') as HTMLTextAreaElement | null

  function write() {
    const form = ref.current?.form
    const target = box()
    if (!form || !target) return
    const f = new FormData(form)
    const num = (name: string) => {
      const v = String(f.get(name) ?? '').trim()
      return v === '' || Number.isNaN(Number(v)) ? null : Number(v)
    }
    target.value = describeProperty({
      type: String(f.get('property_type') ?? ''),
      buildingName,
      roomNumber: String(f.get('room_number') ?? ''),
      floor: num('floor'),
      areaSqm: num('area_sqm'),
      bedrooms: num('bedrooms'),
      bathrooms: num('bathrooms'),
      priceMonthly: num('price_monthly'),
    })
    setAsking(false)
    target.focus()
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (box()?.value.trim()) {
            setAsking(true)
            window.setTimeout(() => cancelRef.current?.focus(), 0)
          } else write()
        }}
        className="inline-flex items-center gap-1 text-xs font-medium text-accent transition-opacity hover:opacity-80 disabled:opacity-60"
      >
        <Sparkles size={12} aria-hidden />
        Generate
      </button>

      <Dialog open={asking} onClose={() => setAsking(false)} label="Replace the description?" role="alertdialog">
        <div className="pointer-events-auto flex w-full max-w-md flex-col gap-3 rounded-xl border border-border bg-surface p-5 text-sm">
          <h2 className="text-base font-semibold">Replace the description you wrote?</h2>
          <p className="text-muted">
            The text in the box is replaced with one written from the fields above. Nothing is saved until
            you save the Property.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button ref={cancelRef} type="button" onClick={() => setAsking(false)} className={BUTTON}>
              Cancel
            </button>
            <button type="button" onClick={write} className={BUTTON}>
              Replace
            </button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
