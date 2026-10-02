'use client'

// Picking a Building: type to search, or type a name that does not exist yet.
//
// It posts two fields. `building_id` is set only when something was chosen off
// the list; `building_name` is whatever is in the box. The action prefers the
// id, and reads that Building's name from the database rather than trusting the
// text — so the title a Property ends up with always matches the Building it
// actually points at (ADR 0008).

import type { BuildingOption } from '@/lib/buildings'
import { Combobox } from './Combobox'

export function BuildingCombobox({
  options,
  capped,
  disabled,
  initial,
  onChoose,
}: {
  options: BuildingOption[]
  /** True when the Org has more Buildings than one read returns. Said out loud,
   *  so a Building missing from the list reads as "there are more" rather than
   *  "it is gone". */
  capped: boolean
  disabled?: boolean
  /** The Building this already points at, on edit. Null on create, and null on
   *  an ETL-imported Property that has no Building yet — which then reads as an
   *  empty required box, because saving one means picking a Building first. */
  initial?: BuildingOption | null
  /** The chosen Building, or null while a new name is being typed — the form
   *  uses it to preview that Building's map. */
  onChoose?: (option: BuildingOption | null) => void
}) {
  return (
    <Combobox
      items={options.map((o) => ({ id: o.id, label: o.name, sub: o.district || undefined }))}
      idName="building_id"
      textName="building_name"
      initialId={initial?.id}
      required
      maxLength={200}
      disabled={disabled}
      placeholder="Type to search, or type a new Building name"
      listLabel="Show the Building list"
      createNote={(name) => (
        <>
          Will create a new Building “<span className="text-ink">{name}</span>”
        </>
      )}
      cappedNote={
        capped &&
        `Showing the first ${options.length} Buildings — if yours is not here, search for it on the Buildings page`
      }
      onChoose={(id) => onChoose?.(options.find((o) => o.id === id) ?? null)}
    />
  )
}
