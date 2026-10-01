'use client'

// The write halves of the Buildings pages: the add form on /buildings/new, and
// edit and delete on the Building's own page in its `?edit=1` mode.
//
// Deleting asks in a dialog (ConfirmAction) that says what it destroys, with the
// number (CLAUDE.md).

import { Trash2 } from 'lucide-react'
import { INPUT, Notice, PRIMARY_BUTTON, useFormAction } from '@/components/form'
import { ConfirmAction } from '@/components/ConfirmAction'
import type { BuildingRow } from '@/lib/buildings'
import { createBuilding, deleteBuilding, updateBuilding } from './actions'

const MAP_HINT = 'Paste the link from the share button in the Google Maps app. Short links (maps.app.goo.gl) work too.'

export function CreateBuildingForm({ slug }: { slug: string }) {
  const [result, action, pending] = useFormAction(createBuilding)

  return (
    <form action={action} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      <input type="hidden" name="slug" value={slug} />
      <Fields pending={pending} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? 'Saving…' : 'Save Building'}
        </button>
        <Notice result={result} />
      </div>
    </form>
  )
}

export function EditBuildingForm({ slug, building }: { slug: string; building: BuildingRow }) {
  const [result, action, pending] = useFormAction(updateBuilding)

  return (
    <form action={action} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="building_id" value={building.id} />
      <Fields pending={pending} building={building} />

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

/** The same five fields, for creating and for editing. */
function Fields({ pending, building }: { pending: boolean; building?: BuildingRow }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-medium">
          Building name<span className="ml-1 text-warn">*</span>
        </span>
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
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">English name</span>
        <input
          type="text"
          name="name_en"
          maxLength={200}
          disabled={pending}
          defaultValue={building?.nameEn ?? ''}
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">District</span>
        <input
          type="text"
          name="district"
          maxLength={100}
          disabled={pending}
          defaultValue={building?.district ?? ''}
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Province</span>
        <input
          type="text"
          name="province"
          maxLength={100}
          disabled={pending}
          defaultValue={building?.province ?? ''}
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-medium">Google Maps link</span>
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
      </label>
    </div>
  )
}
