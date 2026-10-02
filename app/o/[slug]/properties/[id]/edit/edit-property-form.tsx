'use client'

// The edit-a-Property form.
//
// The same Cards as the add form, prefilled — deliberately, so the two are read
// as one form in two moods rather than two screens to learn. The judgement is
// still lib/property-input.ts's, run here early on what the person has in front
// of them and again by the action on what actually arrives.
//
// Photos come in two kinds and one submission. The ones already stored render
// from signed URLs computed on the server (the bucket is private, ADR 0007), and
// removing one only marks it: it stays in the grid, struck through, until save.
// Nothing is destroyed by a click here — `removed_images` says what should go,
// and the action removes the bytes only after the row has stopped naming them
// (ADR 0009).

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ImageOff, ImagePlus, MapPin, Undo2, X } from 'lucide-react'
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
import { PhotoLightbox, type PhotoPreview } from '@/components/PhotoLightbox'
import { STATUS_LABELS, StatusPill } from '@/components/StatusPill'
import type { BuildingOption } from '@/lib/buildings'
import type { OwnerOption } from '@/lib/owners'
import type { PropertyEditRow } from '@/lib/properties'
import type { PropertyImage } from '@/lib/property-storage'
import {
  ACCEPTED_IMAGE_TYPES,
  CREATABLE_STATUSES,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_TOTAL_BYTES,
  mb,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  validatePropertyImageEdit,
} from '@/lib/property-input'
import { updateProperty } from '../actions'
import { GenerateDescription } from '@/components/GenerateDescription'

export function EditPropertyForm({
  slug,
  property,
  photos,
  buildings,
  buildingsCapped,
  owners,
  ownersCapped,
}: {
  slug: string
  property: PropertyEditRow
  /** Signed on the server for this render — the browser never asks Storage. */
  photos: PropertyImage[]
  buildings: BuildingOption[]
  buildingsCapped: boolean
  owners: OwnerOption[]
  ownersCapped: boolean
}) {
  const [result, action, pending] = useFormAction(updateProperty)
  const [files, setFiles] = useState<File[]>([])
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  const [building, setBuilding] = useState<BuildingOption | null>(property.building)
  const [preview, setPreview] = useState<PhotoPreview | null>(null)
  const imagesInputRef = useRef<HTMLInputElement>(null)

  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  // The form posts the input's own FileList, not this state, so removing one
  // new photo means rebuilding that FileList too — a bare `files.filter` here
  // would drop the preview but still upload the photo.
  function removeFileAt(index: number) {
    const transfer = new DataTransfer()
    files.forEach((file, i) => {
      if (i !== index) transfer.items.add(file)
    })
    if (imagesInputRef.current) imagesInputRef.current.files = transfer.files
    setFiles(Array.from(transfer.files))
  }

  // A saved edit stays on this page — updateProperty returns rather than
  // redirecting — so the pending photo work has to be dropped once it has
  // happened. The trigger is the stored photos themselves changing, which is
  // exactly when it did: anything picked or marked here that the action accepted
  // comes back as a different list. Left alone, the picker would still be
  // holding files that are already uploaded and the next save would send them a
  // second time. The <input> is keyed on the same string so the browser's own
  // copy of the selection goes with it.
  const storedKey = photos.map((photo) => photo.path).join('\n')
  const [savedKey, setSavedKey] = useState(storedKey)
  if (savedKey !== storedKey) {
    setSavedKey(storedKey)
    setFiles([])
    setRemoved(new Set())
  }

  const keptCount = photos.length - removed.size
  const imageCheck = validatePropertyImageEdit(keptCount, files)
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0)

  function toggleRemoved(path: string) {
    setRemoved((was) => {
      const next = new Set(was)
      if (!next.delete(path)) next.add(path)
      return next
    })
  }

  return (
    <form action={action} className="flex flex-col gap-6">
      {/* Both name what to act on; neither is where the authority comes from.
          The action resolves the Org from the session through requireMember and
          re-reads this Property under it (ADR 0002), so editing either field
          gets a refusal rather than another agency's row. */}
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="property_id" value={property.id} />

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
            <Field
              label="Status"
              hint={
                property.status === 'rented'
                  ? 'Marked Rented, but no Rental is recorded — set it to Available if the room is free'
                  : 'A Property is only "Rented" when it has a Rental'
              }
            >
              <select
                name="status"
                disabled={pending}
                // Blank posts as "no change", so a stale Rented room keeps its
                // status until somebody picks another one.
                defaultValue={property.status === 'rented' ? '' : property.status}
                className={INPUT}
              >
                {property.status === 'rented' && <option value="">{STATUS_LABELS.rented}</option>}
                {CREATABLE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </Field>
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
        <div className="flex flex-col gap-3">
          {photos.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">
                Existing photos <span className="tabular text-muted">{keptCount} kept</span>
              </p>
              <ul className="flex flex-wrap gap-2">
                {photos.map((photo, index) => {
                  const marked = removed.has(photo.path)
                  return (
                    <li key={photo.path} className="relative">
                      {/* Signed Supabase URLs, never through next/image: they
                          expire, and optimising them would cache bytes the
                          bucket is private to keep. */}
                      {photo.url ? (
                        <button
                          type="button"
                          onClick={() =>
                            setPreview({ src: photo.url as string, alt: `Photo ${index + 1}` })
                          }
                          className="block cursor-zoom-in"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.url}
                            alt={`Photo ${index + 1}`}
                            className={
                              'h-24 w-24 rounded-lg border object-cover transition-opacity ' +
                              (marked ? 'border-warn/60 opacity-30' : 'border-border')
                            }
                          />
                        </button>
                      ) : (
                        <span
                          className={
                            'grid h-24 w-24 place-items-center rounded-lg border border-dashed text-muted ' +
                            (marked ? 'border-warn/60 opacity-30' : 'border-border')
                          }
                        >
                          <ImageOff size={20} aria-hidden />
                        </span>
                      )}

                      {marked && (
                        <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-warn/90 py-0.5 text-center text-[11px] text-bg">
                          Will be deleted
                        </span>
                      )}

                      <button
                        type="button"
                        disabled={pending}
                        aria-label={marked ? `Keep photo ${index + 1}` : `Remove photo ${index + 1}`}
                        onClick={() => toggleRemoved(photo.path)}
                        className={
                          'absolute -top-1.5 -right-1.5 grid h-6 w-6 place-items-center rounded-full border bg-surface transition-colors disabled:opacity-60 ' +
                          (marked
                            ? 'border-border text-muted hover:text-ink'
                            : 'border-border text-muted hover:border-warn hover:text-warn')
                        }
                      >
                        {marked ? <Undo2 size={13} aria-hidden /> : <X size={13} aria-hidden />}
                      </button>
                    </li>
                  )
                })}
              </ul>

              {/* One per marked photo. The action intersects these with the
                  row's own images, so a path that is not on this Property is
                  dropped rather than passed to Storage. */}
              {[...removed].map((path) => (
                <input key={path} type="hidden" name="removed_images" value={path} />
              ))}

              {removed.size > 0 && (
                <p className="text-sm text-muted">
                  The marked photos are deleted when you save — press the undo button on a photo to keep it.
                </p>
              )}
            </div>
          )}

          <label className={`${BUTTON} inline-flex w-fit cursor-pointer items-center gap-2`}>
            <ImagePlus size={16} aria-hidden />
            Add photos
            <input
              key={storedKey}
              ref={imagesInputRef}
              type="file"
              name="images"
              multiple
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              disabled={pending}
              className="sr-only"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
          </label>

          {files.length > 0 && (
            <>
              <ul className="flex flex-wrap gap-2">
                {previews.map((src, index) => (
                  <li key={src} className="relative">
                    <button
                      type="button"
                      onClick={() => setPreview({ src, alt: `New photo ${index + 1}` })}
                      className="block cursor-zoom-in"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={`New photo ${index + 1}`}
                        className="h-24 w-24 rounded-lg border border-border object-cover"
                      />
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      aria-label={`Remove new photo ${index + 1}`}
                      onClick={() => removeFileAt(index)}
                      className="absolute -top-1.5 -right-1.5 grid h-6 w-6 place-items-center rounded-full border border-border bg-surface text-muted transition-colors hover:border-warn hover:text-warn disabled:opacity-60"
                    >
                      <X size={13} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="flex items-center gap-3 text-sm text-muted">
                <span className="tabular">
                  {files.length} new {files.length === 1 ? 'photo' : 'photos'} · {mb(totalBytes)} MB total
                </span>
                <button
                  type="button"
                  disabled={pending}
                  // Clearing state alone would leave the input holding the files,
                  // and the form posts the input, not the state.
                  onClick={(event) => {
                    const input = event.currentTarget.form?.elements.namedItem('images')
                    if (input instanceof HTMLInputElement) input.value = ''
                    setFiles([])
                  }}
                  className="inline-flex items-center gap-1 text-muted transition-colors hover:text-ink"
                >
                  <X size={14} aria-hidden />
                  Remove all new photos
                </button>
              </p>
            </>
          )}

          {!imageCheck.ok && (
            <p role="status" className="text-sm text-warn">
              {imageCheck.message}
            </p>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || !imageCheck.ok} className={PRIMARY_BUTTON}>
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
      <PhotoLightbox photo={preview} onClose={() => setPreview(null)} />
    </form>
  )
}
