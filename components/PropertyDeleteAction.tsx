'use client'

// Deleting a Property straight from the list row, through the one confirm
// dialog every delete uses (ConfirmAction). It posts to the same deleteProperty
// action the edit page's PropertyDeleteForm uses; the list is already where
// that action redirects on success, so a delete started here lands back on the
// list it removed the row from.
//
// It cannot name a photo count the way the edit page's version does — the
// list query deliberately does not select the images array (lib/properties.ts:
// "a list row does not need a Property's... image array"), and adding it back
// just for this warning would cost every row on every page load to save one
// line of text on the rare row somebody deletes.

import { Trash2 } from 'lucide-react'
import { ConfirmAction } from '@/components/ConfirmAction'
import { deleteProperty } from '@/app/o/[slug]/properties/[id]/actions'

export function PropertyDeleteAction({
  slug,
  propertyId,
  title,
}: {
  slug: string
  propertyId: string
  title: string
}) {
  return (
    <ConfirmAction
      action={deleteProperty}
      fields={{ slug, property_id: propertyId }}
      triggerLabel={`Delete ${title}`}
      trigger={
        <>
          <Trash2 size={14} aria-hidden />
          Delete
        </>
      }
      title="Delete Property"
    >
      <p>
        Delete <span className="font-semibold">{title}</span>? It cannot be recovered.
      </p>
      <p className="text-muted">A Property that has ever had a Rental or a Payment cannot be deleted.</p>
    </ConfirmAction>
  )
}
