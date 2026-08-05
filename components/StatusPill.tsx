// A Property's status, readable without comparing shades.
//
// Colour alone fails the person scanning a column of forty rows on a laptop in
// daylight, and fails anyone who does not separate red from green. So each
// status carries a shape as well: a filled disc, a half disc, a ring. The teak
// accent is not used here — status never borrows the brand colour (CLAUDE.md).
//
// Read as an occupancy board, not as "is this property earning": Available is
// the state an agent can act on (green — free to place a tenant), Reserved is
// pending, and Rented is plain rather than green because it needs nothing from
// anyone. It is deliberately NOT warn/red either — PropertyTable's RentalEnd
// already spends red on a lease that is actually overdue, in the very next
// column, and every occupied row turning red would bury that signal.
//
// The shape is a Lucide icon, not a Unicode character — this app's icon
// language everywhere else (MapPin, ImagePlus, Building2, …), so there is no
// font/platform variance in how a status reads.

import type { LucideIcon } from 'lucide-react'
import { Circle, CircleDashed, CircleDot } from 'lucide-react'
import type { PropertyStatus } from '@/lib/properties'

const STATUS: Record<PropertyStatus, { label: string; glyph: LucideIcon; filled?: boolean; className: string }> = {
  // Occupied and unremarkable — the shape still says "filled", the colour says
  // "nothing to do here" so it does not compete with a real overdue warning.
  rented: {
    label: 'Rented',
    glyph: Circle,
    filled: true,
    className: 'border-border text-muted',
  },
  // Someone is on the hook for it but nothing is signed.
  reserved: {
    label: 'Reserved',
    glyph: CircleDot,
    className: 'border-hold/40 text-hold',
  },
  // Free to place a tenant into — the good, actionable state on this board.
  available: {
    label: 'Available',
    glyph: CircleDashed,
    className: 'border-ok/40 text-ok',
  },
}

export function StatusPill({ status }: { status: PropertyStatus }) {
  const { label, glyph: Glyph, filled, className } = STATUS[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${className}`}
    >
      <Glyph size={12} aria-hidden fill={filled ? 'currentColor' : 'none'} />
      {label}
    </span>
  )
}

export const STATUS_LABELS: Record<PropertyStatus, string> = {
  available: STATUS.available.label,
  reserved: STATUS.reserved.label,
  rented: STATUS.rented.label,
}
