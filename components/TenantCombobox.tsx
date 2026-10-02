'use client'

// Picking a Tenant, or typing the name of a new one — BuildingCombobox's shape.
// Posts `tenant_id` when one was chosen off the list and `tenant_name` with
// whatever is in the box; the action prefers the id.

import type { TenantOption } from '@/lib/tenants'
import { MAX_TENANT_NAME } from '@/lib/rental-input'
import { Combobox } from './Combobox'

export function TenantCombobox({
  options,
  capped,
  disabled,
  onCreatingChange,
}: {
  options: TenantOption[]
  capped: boolean
  disabled?: boolean
  /** True while the box holds a name that was not picked off the list — the
   *  form then asks for the new Tenant's phone, LINE id and note. */
  onCreatingChange?: (creating: boolean) => void
}) {
  return (
    <Combobox
      items={options.map((o) => ({ id: o.id, label: o.name, sub: o.phone ?? undefined }))}
      idName="tenant_id"
      textName="tenant_name"
      required
      maxLength={MAX_TENANT_NAME}
      disabled={disabled}
      placeholder="Type to search, or type a new Tenant's name"
      listLabel="Show the Tenant list"
      createNote={(name) => (
        <>
          Will add a new Tenant “<span className="text-ink">{name}</span>” — pick them above instead
          if they are already on file
        </>
      )}
      cappedNote={
        capped &&
        `Showing the first ${options.length} Tenants by name — one further down the alphabet will not be found here`
      }
      onCreatingChange={onCreatingChange}
    />
  )
}
