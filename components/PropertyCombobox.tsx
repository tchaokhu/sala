'use client'

// Picking the Property a Rental lets: only the ones with no active Rental, and
// only off the list — a Property is added on its own page first. Posts
// `property_id`; the action re-checks it against the Org.

import type { RentableProperty } from '@/lib/rentals'
import { formatBaht } from '@/lib/format'
import { Combobox } from './Combobox'

export function PropertyCombobox({
  options,
  capped,
  disabled,
  initial,
  onChoose,
}: {
  options: RentableProperty[]
  capped: boolean
  disabled?: boolean
  initial?: RentableProperty | null
  onChoose?: (option: RentableProperty | null) => void
}) {
  return (
    <Combobox
      items={options.map((o) => ({
        id: o.id,
        // English first when the Building has a name in it; the Thai title
        // stays on the sub line and in the search.
        label: o.titleEn || o.title,
        terms: o.title,
        sub:
          (o.titleEn ? `${o.title} · ` : '') +
          `${formatBaht(o.priceMonthly)}/month` +
          (o.ownerName ? ` · ${o.ownerName}` : '') +
          // Another agent's room until now; recording our Rental moves it on.
          (o.status === 'let_elsewhere' ? ' · let elsewhere until now' : ''),
      }))}
      idName="property_id"
      initialId={initial?.id}
      required
      disabled={disabled}
      placeholder="Type to search the Properties with no active Rental"
      listLabel="Show the Property list"
      emptyNote={(text) => (
        <>
          No Property without an active Rental matches “<span className="text-ink">{text}</span>”. A
          Property that already has one must have it ended first.
        </>
      )}
      cappedNote={
        capped &&
        `Showing the first ${options.length} Properties — if yours is not here, open it from the Properties list and use “Rent this Property”`
      }
      onChoose={(id) => onChoose?.(options.find((o) => o.id === id) ?? null)}
    />
  )
}
