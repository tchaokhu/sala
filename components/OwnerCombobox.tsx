'use client'

// Picking an Owner: type to search the ones already on file, or leave it empty.
//
// It posts one field, `owner_id`, and only when something was chosen off the
// list. There is no "create this one" branch the way BuildingCombobox has: a new
// person is added on the Owners page first. Which is also why an unmatched name
// has to say so out loud — the text in the box is never posted, so a half-typed
// name would otherwise save as no Owner at all without ever admitting it.

import type { OwnerOption } from '@/lib/owners'
import { Combobox } from './Combobox'

export function OwnerCombobox({
  options,
  capped,
  disabled,
  initial,
}: {
  options: OwnerOption[]
  /** True when the Org has more Owners than one read returns. */
  capped: boolean
  disabled?: boolean
  /** The Owner this already points at, on edit. Null on create, and null on any
   *  Property whose Owner is simply not on file — a normal Property, not an
   *  unfinished one. */
  initial?: OwnerOption | null
}) {
  return (
    <Combobox
      // The box reads "name — phone" once picked: the pair that tells two
      // people with one name apart. The search matches the number too.
      items={options.map((o) => ({ id: o.id, label: o.name, sub: o.phone, display: label(o) }))}
      idName="owner_id"
      initialId={initial?.id}
      disabled={disabled}
      placeholder="Type a name or phone number to search"
      listLabel="Show the Owner list"
      clearLabel="Clear the Owner"
      emptyNote={(text) => (
        <>
          No Owner matches “<span className="text-ink">{text}</span>” — add them on the Owners page,
          then come back
        </>
      )}
      cappedNote={
        capped &&
        `Showing the first ${options.length} Owners — if yours is not here, search for them on the Owners page`
      }
    />
  )
}

/** What sits in the box once one is picked. */
function label(owner: OwnerOption): string {
  return `${owner.name} — ${owner.phone}`
}
