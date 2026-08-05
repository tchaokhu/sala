// A Google Maps link, drawn.
//
// Not every valid link can be drawn: a shortener that could not be followed, or
// a URL with neither coordinates nor a place name in it, has nothing to centre
// on. Those get the link as a button and a line saying why there is no map —
// a blank grey frame would leave somebody wondering whether the link was wrong
// (CLAUDE.md: errors say what to do next).
//
// The iframe is Google's keyless `output=embed`, so no API key and no billing
// account are involved. `referrerPolicy` keeps the Org's own URL — which
// carries the slug — out of the request to Google.

import { ExternalLink, MapPinOff } from 'lucide-react'
import { mapEmbedSrc } from '@/lib/google-map'

export function MapPreview({
  url,
  title,
  className = 'h-48',
}: {
  url: string | null | undefined
  /** Named for a screen reader: "Map of Lumpini Park", not "map". */
  title: string
  className?: string
}) {
  if (!url) return null

  const src = mapEmbedSrc(url)

  if (!src) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted">
        <span className="flex items-center gap-2">
          <MapPinOff size={16} aria-hidden />
          This link has no coordinates in it, so there is no map to draw
        </span>
        <OpenLink url={url} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <iframe
        src={src}
        title={title}
        loading="lazy"
        referrerPolicy="no-referrer"
        className={`w-full rounded-lg border border-border ${className}`}
      />
      <OpenLink url={url} />
    </div>
  )
}

function OpenLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1.5 text-sm text-accent underline-offset-4 hover:underline"
    >
      <ExternalLink size={14} aria-hidden />
      Open in Google Maps
    </a>
  )
}
