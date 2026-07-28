// A Property's status, readable without comparing shades.
//
// Colour alone fails the person scanning a column of forty rows on a laptop in
// daylight, and fails anyone who does not separate red from green. So each
// status carries a shape as well: a filled disc, a half disc, a ring. The teak
// accent is not used here — status never borrows the brand colour (CLAUDE.md).

import type { PropertyStatus } from '@/lib/properties'

const STATUS: Record<PropertyStatus, { label: string; glyph: string; className: string }> = {
  // Earning. The ordinary, good state, so it reads calm rather than loud.
  rented: {
    label: 'มีผู้เช่า',
    glyph: '●',
    className: 'border-ok/40 text-ok',
  },
  // Someone is on the hook for it but nothing is signed.
  reserved: {
    label: 'จอง',
    glyph: '◐',
    className: 'border-hold/40 text-hold',
  },
  // Empty, and empty is what an agency is paid to fix — an outline, so a page
  // of vacancies looks unfinished rather than fine.
  available: {
    label: 'ว่าง',
    glyph: '○',
    className: 'border-border text-muted',
  },
}

export function StatusPill({ status }: { status: PropertyStatus }) {
  const { label, glyph, className } = STATUS[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${className}`}
    >
      <span aria-hidden>{glyph}</span>
      {label}
    </span>
  )
}

export const STATUS_LABELS: Record<PropertyStatus, string> = {
  available: STATUS.available.label,
  reserved: STATUS.reserved.label,
  rented: STATUS.rented.label,
}
