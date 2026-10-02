'use client'

// A single reusable preview overlay for the Property photo grids (new-photo
// previews and already-stored photos alike) — one component so the add and
// edit forms cannot drift into two different previewing behaviours.

import { X } from 'lucide-react'
import { Dialog } from './Dialog'

export type PhotoPreview = { src: string; alt: string }

export function PhotoLightbox({
  photo,
  onClose,
}: {
  photo: PhotoPreview | null
  onClose: () => void
}) {
  return (
    <Dialog open={!!photo} onClose={onClose} label={photo?.alt ?? ''} closeLabel="Close preview">
      {photo && (
        <div className="pointer-events-auto relative max-h-full max-w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.src}
            alt={photo.alt}
            className="max-h-[85vh] max-w-[90vw] rounded-lg border border-border object-contain"
          />
          <button
            type="button"
            aria-label="Close preview"
            onClick={onClose}
            className="absolute -top-3 -right-3 grid h-8 w-8 place-items-center rounded-full border border-border bg-surface text-muted transition-colors hover:text-ink"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      )}
    </Dialog>
  )
}
