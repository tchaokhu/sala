'use client'

// The read-only photo grid for the view page. Same signed-URL images the edit
// form shows, minus everything about changing them — just the grid and the
// lightbox, reusing PhotoLightbox so zooming in behaves identically everywhere
// a Property's photos are shown.

import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import { PhotoLightbox, type PhotoPreview } from '@/components/PhotoLightbox'
import type { PropertyImage } from '@/lib/property-storage'

export function PropertyPhotoGallery({ photos }: { photos: PropertyImage[] }) {
  const [preview, setPreview] = useState<PhotoPreview | null>(null)

  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {photos.map((photo, index) =>
          photo.url ? (
            <li key={photo.path}>
              <button
                type="button"
                onClick={() => setPreview({ src: photo.url as string, alt: `Photo ${index + 1}` })}
                className="block cursor-zoom-in"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={`Photo ${index + 1}`}
                  className="h-24 w-24 rounded-lg border border-border object-cover"
                />
              </button>
            </li>
          ) : (
            <li key={photo.path}>
              <span className="grid h-24 w-24 place-items-center rounded-lg border border-dashed border-border text-muted">
                <ImageOff size={20} aria-hidden />
              </span>
            </li>
          ),
        )}
      </ul>
      <PhotoLightbox photo={preview} onClose={() => setPreview(null)} />
    </>
  )
}
