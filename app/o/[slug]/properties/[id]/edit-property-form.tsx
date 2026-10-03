'use client'

// The edit-a-Property form.
//
// The same Cards as the add form, prefilled — deliberately, so the two are read
// as one form in two moods rather than two screens to learn. The judgement is
// still lib/property-input.ts's, run here early on what the person has in front
// of them and again by the action on what actually arrives.
//
// Photos come in two kinds and one submission, both in PhotoPicker. The ones
// already stored render from signed URLs computed on the server (the bucket is
// private, ADR 0007), and removing one only marks it: it stays in the grid,
// struck through, until save. Nothing is destroyed by a click here —
// `removed_images` says what should go, and the action removes the bytes only
// after the row has stopped naming them (ADR 0009). New and stored photos share
// one order, posted as `image_order` and checked by the action (orderImages).

import { useState } from 'react'
import Link from 'next/link'
import { MapPin } from 'lucide-react'
import {
  BUTTON,
  Card,
  Field,
  INPUT,
  Notice,
  PRIMARY_BUTTON,
  useFormAction,
} from '@/components/form'
import { BuildingCombobox } from '@/components/BuildingCombobox'
import { OwnerCombobox } from '@/components/OwnerCombobox'
import { MapPreview } from '@/components/MapPreview'
import { PhotoPicker } from '@/components/PhotoPicker'
import { StatusPill } from '@/components/StatusPill'
import type { BuildingOption } from '@/lib/buildings'
import type { OwnerOption } from '@/lib/owners'
import type { PropertyEditRow } from '@/lib/properties'
import type { PropertyImage } from '@/lib/property-storage'
import {
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_TOTAL_BYTES,
  mb,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
} from '@/lib/property-input'
import { updateProperty } from './actions'
import { GenerateDescription } from '@/components/GenerateDescription'
import { PropertyStatusField } from '@/components/PropertyStatusField'

export function EditPropertyForm({
  slug,
  property,
  photos,
  buildings,
  buildingsCapped,
  owners,
  ownersCapped,
  readOnly,
}: {
  slug: string
  property: PropertyEditRow
  /** Signed on the server for this render — the browser never asks Storage. */
  photos: PropertyImage[]
  buildings: BuildingOption[]
  buildingsCapped: boolean
  owners: OwnerOption[]
  ownersCapped: boolean
  /** View mode: every field shown, none editable, no Save. The browser's own
   *  <fieldset disabled> does it, so nothing inside can be missed. */
  readOnly?: boolean
}) {
  const [result, action, pending] = useFormAction(updateProperty)
  const [building, setBuilding] = useState<BuildingOption | null>(property.building)
  const [photosOk, setPhotosOk] = useState(true)

  return (
    <form action={action} className="flex flex-col gap-6">
      {/* Both name what to act on; neither is where the authority comes from.
          The action resolves the Org from the session through requireMember and
          re-reads this Property under it (ADR 0002), so editing either field
          gets a refusal rather than another agency's row. */}
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="property_id" value={property.id} />

      <fieldset disabled={readOnly} className="contents">

        <Card
          title="Building and Room"
          note="A Property's name is its Building name followed by the room number — change either one and the name follows"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Building"
              required
              hint="Move it to another Building, or type a new name to create one"
              wide
            >
              <BuildingCombobox
                options={buildings}
                capped={buildingsCapped}
                disabled={pending}
                initial={property.building}
                onChoose={setBuilding}
              />
            </Field>

            <Field label="Room number" hint="Leave it blank for a whole house">
              <input
                type="text"
                name="room_number"
                maxLength={40}
                disabled={pending}
                defaultValue={property.roomNumber ?? ''}
                placeholder="12/34"
                className={INPUT}
              />
            </Field>

            <Field label="Type" required>
              <select
                name="property_type"
                required
                disabled={pending}
                defaultValue={property.propertyType}
                className={INPUT}
              >
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
                defaultValue={property.priceMonthly}
                placeholder="18000"
                className={`${INPUT} tabular text-right`}
              />
            </Field>

            {/* A Property with an active Rental has no field here at all — not a
                disabled one: a field that is only hidden is still a field a
                hand-built POST can fill. The action locks it too (ADR 0009,
                amended); this is the half a person sees. */}
            {property.activeRentalId ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Status</span>
                <span className="flex h-[38px] items-center">
                  <StatusPill status={property.status} />
                </span>
                <span className="text-xs text-muted">
                  Changes when{' '}
                  <Link
                    href={`/o/${slug}/rentals/${property.activeRentalId}`}
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    its Rental
                  </Link>{' '}
                  ends
                </span>
              </div>
            ) : (
              <PropertyStatusField
                label="Status"
                hint={
                  property.status === 'rented'
                    ? 'Marked Rented, but no Rental is recorded — set it to Available if the room is free'
                    : 'A Property is only "Rented" when it has a Rental'
                }
                initial={property.status}
                initialFreeOn={property.freeOn}
                disabled={pending}
              />
            )}
          </div>

          {/* The map belongs to the Building, so it follows whichever one is
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
          note="The person who owns this Property. Clear it if the Org has nobody on file for it"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Owner" hint="Only Owners already on file can be picked — add a new one on the Owners page">
              <OwnerCombobox
                options={owners}
                capped={ownersCapped}
                disabled={pending}
                initial={property.owner}
              />
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
                defaultValue={property.bedrooms}
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
                defaultValue={property.bathrooms}
                className={`${INPUT} tabular`}
              />
            </Field>

            <Field label="Area (sq m)">
              <input
                type="text"
                inputMode="decimal"
                name="area_sqm"
                disabled={pending}
                defaultValue={property.areaSqm}
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
                defaultValue={property.floor ?? ''}
                className={`${INPUT} tabular`}
              />
            </Field>

            <Field label="LINE contact">
              <input
                type="text"
                name="contact_line"
                maxLength={100}
                disabled={pending}
                defaultValue={property.contactLine ?? ''}
                className={INPUT}
              />
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
                defaultValue={property.description ?? ''}
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
          )} MB per upload`}
        >
          <PhotoPicker stored={photos} pending={pending} onValidChange={setPhotosOk} />
        </Card>
      </fieldset>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending || !photosOk} className={PRIMARY_BUTTON}>
            {pending ? 'Saving…' : 'Save changes'}
          </button>
          <Link
            href={`/o/${slug}/properties`}
            className={`${BUTTON} inline-flex items-center text-muted`}
          >
            Cancel
          </Link>
          <Notice result={result} />
        </div>
      )}
    </form>
  )
}
