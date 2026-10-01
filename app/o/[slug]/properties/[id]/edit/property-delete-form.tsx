'use client'

// Removing a Property, through the one confirm dialog every delete uses
// (ConfirmAction). It says what it destroys, with the number of photos that go
// with it (CLAUDE.md).
//
// What it cannot do is said before the click rather than after: a Property with
// a Rental or a Payment behind it is refused by Postgres, and the action's
// message for that arrives in the dialog.

import { Trash2 } from 'lucide-react'
import { Card } from '@/components/form'
import { ConfirmAction } from '@/components/ConfirmAction'
import { deleteProperty } from '../actions'

export function PropertyDeleteForm({
  slug,
  propertyId,
  title,
  photoCount,
}: {
  slug: string
  propertyId: string
  title: string
  photoCount: number
}) {
  return (
    <Card
      title="Delete Property"
      note="A deleted Property cannot be recovered, and a Property that has ever had a Rental or a Payment cannot be deleted at all"
    >
      <ConfirmAction
        action={deleteProperty}
        fields={{ slug, property_id: propertyId }}
        trigger={
          <>
            <Trash2 size={14} aria-hidden />
            Delete this Property
          </>
        }
        title="Delete Property"
      >
        <p>
          Delete <span className="font-semibold">{title}</span>? It cannot be recovered.
        </p>
        <p>
          {photoCount > 0 ? (
            <>
              The <span className="tabular font-semibold">{photoCount}</span>{' '}
              {photoCount === 1 ? 'photo' : 'photos'} on this Property will be deleted too.
            </>
          ) : (
            'This Property has no photos.'
          )}
        </p>
      </ConfirmAction>
    </Card>
  )
}
