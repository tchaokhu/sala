'use client'

// The write halves of the Buildings pages: the add form on /buildings/new, and
// edit and delete on the Building's own page, which opens as its editor.
//
// Deleting asks in a dialog (ConfirmAction) that says what it destroys, with the
// number (CLAUDE.md).

import { Trash2 } from 'lucide-react'
import { Field, INPUT, Notice, PRIMARY_BUTTON, useFormAction } from '@/components/form'
import { ConfirmAction } from '@/components/ConfirmAction'
import type { BuildingDetail, BuildingRow } from '@/lib/buildings'
import { MAX_LIST_ITEMS } from '@/lib/building-input'
import { createBuilding, deleteBuilding, updateBuilding } from './actions'
import { PANEL } from '@/components/styles'
import { AddressFields } from '@/components/AddressFields'
import type { AddressInitial, Place } from '@/lib/thai-places'

/** The address pickers' lists, read on the server by the page. */
export interface AddressProps {
  provinces: Place[]
  initial?: AddressInitial
}

const MAP_HINT = 'Paste the link from the share button in the Google Maps app. Short links (maps.app.goo.gl) work too.'

export function CreateBuildingForm({ slug, address }: { slug: string; address: AddressProps }) {
  const [result, action, pending] = useFormAction(createBuilding)

  return (
    <form action={action} className={`flex flex-col gap-4 ${PANEL}`}>
      <input type="hidden" name="slug" value={slug} />
      <Fields pending={pending} address={address} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? 'Saving…' : 'Save Building'}
        </button>
        <Notice result={result} />
      </div>
    </form>
  )
}

export function EditBuildingForm({
  slug,
  building,
  address,
}: {
  slug: string
  building: BuildingDetail
  address: AddressProps
}) {
  const [result, action, pending] = useFormAction(updateBuilding)

  return (
    <form action={action} className={`flex flex-col gap-4 ${PANEL}`}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="building_id" value={building.id} />
      <Fields pending={pending} building={building} address={address} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        <Notice result={result} />
      </div>
    </form>
  )
}

/** Delete, through the one confirm dialog every delete uses. Used on the
 *  Building's page and on its row in the list; either way the action redirects
 *  to the list. It says what it strands, with the number (CLAUDE.md). */
export function DeleteBuildingForm({
  slug,
  building,
  compact = false,
}: {
  slug: string
  building: Pick<BuildingRow, 'id' | 'name' | 'propertyCount'>
  /** The list row's short "Delete" rather than "Delete Building". */
  compact?: boolean
}) {
  return (
    <ConfirmAction
      action={deleteBuilding}
      fields={{ slug, building_id: building.id }}
      triggerLabel={`Delete ${building.name}`}
      trigger={
        <>
          <Trash2 size={14} aria-hidden />
          {compact ? 'Delete' : 'Delete Building'}
        </>
      }
      title="Delete Building"
    >
      <p>
        Delete <span className="font-semibold">{building.name}</span>?
      </p>
      <p>
        {building.propertyCount > 0 ? (
          <>
            The <span className="tabular font-semibold">{building.propertyCount}</span>{' '}
            {building.propertyCount === 1 ? 'Property' : 'Properties'} in this Building will stay,
            but they will no longer have a Building or a map.
          </>
        ) : (
          'No Properties are in this Building.'
        )}
      </p>
    </ConfirmAction>
  )
}

/** The same fields, for creating and for editing. */
function Fields({
  pending,
  building,
  address,
}: {
  pending: boolean
  building?: BuildingDetail
  address: AddressProps
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Building name" required wide>
        <input
          type="text"
          name="name"
          required
          maxLength={200}
          disabled={pending}
          defaultValue={building?.name ?? ''}
          placeholder="e.g. Lumpini Park Rama 9"
          className={INPUT}
        />
      </Field>

      <Field label="English name" wide>
        <input
          type="text"
          name="name_en"
          maxLength={200}
          disabled={pending}
          defaultValue={building?.nameEn ?? ''}
          className={INPUT}
        />
      </Field>

      <AddressFields provinces={address.provinces} initial={address.initial} disabled={pending} />

      <Field label="Google Maps link" wide>
        <input
          type="url"
          name="google_map_url"
          maxLength={2000}
          disabled={pending}
          defaultValue={building?.googleMapUrl ?? ''}
          placeholder="https://maps.app.goo.gl/…"
          className={INPUT}
        />
        <span className="text-xs text-muted">{MAP_HINT}</span>
      </Field>

      <ListField label="Facilities" name="facilities" pending={pending} items={building?.facilities} placeholder={'Swimming pool\nFitness\nCo-working space'} />
      <ListField label="Nearby" name="nearby" pending={pending} items={building?.nearby} placeholder={'BTS Phra Ram 9\nCentral Rama 9'} />
    </div>
  )
}

/** One item per line — see parseList for why lines and not commas. */
function ListField({
  label,
  name,
  pending,
  items,
  placeholder,
}: {
  label: string
  name: 'facilities' | 'nearby'
  pending: boolean
  items?: string[]
  placeholder: string
}) {
  return (
    <Field label={label}>
      <textarea
        name={name}
        rows={6}
        disabled={pending}
        defaultValue={(items ?? []).join('\n')}
        placeholder={placeholder}
        className={INPUT}
      />
      <span className="text-xs text-muted">
        One per line, up to {MAX_LIST_ITEMS}
      </span>
    </Field>
  )
}
