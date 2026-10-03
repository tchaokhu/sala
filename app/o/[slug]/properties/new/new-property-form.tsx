'use client'

// The add-a-Property form.
//
// The judgement is not here — it is in lib/property-input.ts, which the Server
// Action runs on the values that actually arrive. This runs the same functions
// early so the common mistakes (nine photos, a 6 MB one) are caught before the
// bytes cross the network, and so the message a person reads is the same one
// either way.
//
// Photos are chosen, ordered and previewed in PhotoPicker, the same one the edit
// form uses; the order shown is the order saved, the first photo the cover.

import { useState } from 'react'
import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { Card, Field, INPUT, Notice, PRIMARY_BUTTON, useFormAction } from '@/components/form'
import { BuildingCombobox } from '@/components/BuildingCombobox'
import { OwnerCombobox } from '@/components/OwnerCombobox'
import { MapPreview } from '@/components/MapPreview'
import { PhotoPicker } from '@/components/PhotoPicker'
import type { BuildingOption } from '@/lib/buildings'
import type { OwnerOption } from '@/lib/owners'
import {
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_TOTAL_BYTES,
  mb,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
} from '@/lib/property-input'
import { createProperty } from '../actions'
import { GenerateDescription } from '@/components/GenerateDescription'
import { PropertyStatusField } from '@/components/PropertyStatusField'

export function NewPropertyForm({
  slug,
  buildings,
  buildingsCapped,
  owners,
  ownersCapped,
}: {
  slug: string
  buildings: BuildingOption[]
  buildingsCapped: boolean
  owners: OwnerOption[]
  ownersCapped: boolean
}) {
  const [result, action, pending] = useFormAction(createProperty)
  const [building, setBuilding] = useState<BuildingOption | null>(null)
  const [photosOk, setPhotosOk] = useState(true)

  return (
    <form action={action} className="flex flex-col gap-6">
      {/* Names which Org to resolve. It is not where the Org comes from — the
          action reads that from the session through requireMember (ADR 0002),
          so editing this field gets a refusal, not another agency's books. */}
      <input type="hidden" name="slug" value={slug} />

      <Card
        title="Building and Room"
        note="A Property's name is its Building name followed by the room number, so there is no name to type"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Building"
            required
            hint="Not in the list? Type a new name and it will be created for you"
            wide
          >
            <BuildingCombobox
              options={buildings}
              capped={buildingsCapped}
              disabled={pending}
              onChoose={setBuilding}
            />
          </Field>

          <Field label="Room number" hint="Leave it blank for a whole house">
            <input
              type="text"
              name="room_number"
              maxLength={40}
              disabled={pending}
              placeholder="12/34"
              className={INPUT}
            />
          </Field>

          <Field label="Type" required>
            <select name="property_type" required disabled={pending} defaultValue="condo" className={INPUT}>
              {PROPERTY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PROPERTY_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Rent per month (THB)" required>
            <input
              type="text"
              inputMode="decimal"
              name="price_monthly"
              required
              disabled={pending}
              placeholder="18000"
              className={`${INPUT} tabular text-right`}
            />
          </Field>

          <PropertyStatusField
            label="Starting status"
            hint='A Property is only "Rented" once a Rental is created'
            initial="available"
            disabled={pending}
          />

        </div>

        {/* The map belongs to the Building, so it appears as soon as one is
            chosen and is read-only here — the Buildings page is where it changes. */}
        {building &&
          (building.googleMapUrl ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Map of this Building</p>
              <MapPreview url={building.googleMapUrl} title={`Map of ${building.name}`} />
            </div>
          ) : (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <MapPin size={16} aria-hidden />
              This Building has no map link yet —
              <Link
                href={`/o/${slug}/buildings`}
                className="text-accent underline-offset-4 hover:underline"
              >
                add one on the Buildings page
              </Link>
            </p>
          ))}
      </Card>

      <Card
        title="Owner"
        note="The person who owns this Property. Leave it blank if the Org has nobody on file for it"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Owner" hint="Only Owners already on file can be picked — add a new one on the Owners page">
            <OwnerCombobox options={owners} capped={ownersCapped} disabled={pending} />
          </Field>
        </div>
      </Card>

      <Card title="Size">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Bedrooms">
            <input
              type="number"
              name="bedrooms"
              min={0}
              max={99}
              step={1}
              disabled={pending}
              placeholder="0"
              className={`${INPUT} tabular`}
            />
          </Field>

          <Field label="Bathrooms">
            <input
              type="number"
              name="bathrooms"
              min={0}
              max={99}
              step={1}
              disabled={pending}
              placeholder="0"
              className={`${INPUT} tabular`}
            />
          </Field>

          <Field label="Area (sq m)">
            <input
              type="text"
              inputMode="decimal"
              name="area_sqm"
              disabled={pending}
              placeholder="0"
              className={`${INPUT} tabular`}
            />
          </Field>

          <Field label="Floor">
            <input
              type="number"
              name="floor"
              min={-10}
              max={200}
              step={1}
              disabled={pending}
              className={`${INPUT} tabular`}
            />
          </Field>

          {/* No address, district or province here: those describe the Building,
              and they are entered once on it rather than on every unit inside. */}
          <Field label="LINE contact">
            <input type="text" name="contact_line" maxLength={100} disabled={pending} className={INPUT} />
          </Field>

          <Field
            label="Description"
            wide
            action={<GenerateDescription buildingName={building?.name ?? null} disabled={pending} />}
          >
            <textarea
              name="description"
              rows={4}
              maxLength={4000}
              disabled={pending}
              placeholder="Furniture, view, rental terms"
              className={INPUT}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Photos"
        note={`Up to ${MAX_IMAGES} photos, ${mb(MAX_IMAGE_BYTES)} MB each, ${mb(
          MAX_IMAGES_TOTAL_BYTES,
        )} MB in total`}
      >
        <PhotoPicker pending={pending} onValidChange={setPhotosOk} />
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || !photosOk} className={PRIMARY_BUTTON}>
          {pending ? 'Saving…' : 'Save Property'}
        </button>
        <Notice result={result} />
      </div>
    </form>
  )
}
