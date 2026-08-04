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

import { useEffect, useMemo, useState } from 'react'
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
import { MapPreview } from '@/components/MapPreview'
import { STATUS_LABELS, StatusPill } from '@/components/StatusPill'
import type { BuildingOption } from '@/lib/buildings'
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

export function EditPropertyForm({
  slug,
  property,
  photos,
  buildings,
  buildingsCapped,
}: {
  slug: string
  property: PropertyEditRow
  /** Signed on the server for this render — the browser never asks Storage. */
  photos: PropertyImage[]
  buildings: BuildingOption[]
  buildingsCapped: boolean
}) {
  const [result, action, pending] = useFormAction(updateProperty)
  const [files, setFiles] = useState<File[]>([])
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  const [building, setBuilding] = useState<BuildingOption | null>(property.building)

  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

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
        title="โครงการและห้อง"
        note="ชื่อทรัพย์คือชื่อโครงการต่อด้วยเลขห้อง เปลี่ยนอย่างใดอย่างหนึ่งแล้วชื่อจะตามไปเอง"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="โครงการ"
            required
            hint="ย้ายไปโครงการอื่นได้ หรือพิมพ์ชื่อใหม่เพื่อสร้างโครงการ"
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

          <Field label="เลขห้อง" hint="เว้นว่างได้ ถ้าเป็นบ้านทั้งหลัง">
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

          <Field label="ประเภท" required>
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

          <Field label="ค่าเช่าต่อเดือน (บาท)" required>
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

          {/* A Property at มีผู้เช่า has no field here at all — not a disabled
              one. There is no Rental-management flow that could end the tenancy
              (ADR 0009), and a field that is only hidden is still a field a
              hand-built POST can fill. The action locks it too; this is the half
              a person sees. */}
          {property.status === 'rented' ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">สถานะ</span>
              <span className="flex h-[38px] items-center">
                <StatusPill status="rented" />
              </span>
              <span className="text-xs text-muted">
                สถานะนี้เปลี่ยนได้เมื่อสัญญาเช่าสิ้นสุดเท่านั้น
              </span>
            </div>
          ) : (
            <Field label="สถานะ" hint='ทรัพย์จะเป็น "มีผู้เช่า" เมื่อมีสัญญาเช่าเท่านั้น'>
              <select
                name="status"
                disabled={pending}
                defaultValue={property.status}
                className={INPUT}
              >
                {CREATABLE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        {/* The map belongs to the โครงการ, so it follows whichever one is
            chosen and is read-only here — จัดการโครงการ is where it changes. */}
        {building &&
          (building.googleMapUrl ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">แผนที่ของโครงการนี้</p>
              <MapPreview url={building.googleMapUrl} title={`แผนที่ ${building.name}`} />
            </div>
          ) : (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <MapPin size={16} aria-hidden />
              โครงการนี้ยังไม่มีลิงก์แผนที่ —
              <Link
                href={`/o/${slug}/buildings`}
                className="text-accent underline-offset-4 hover:underline"
              >
                เพิ่มได้ในหน้าจัดการโครงการ
              </Link>
            </p>
          ))}
      </Card>

      <Card title="ขนาด">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="ห้องนอน">
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

          <Field label="ห้องน้ำ">
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

          <Field label="ขนาด (ตร.ม.)">
            <input
              type="text"
              inputMode="decimal"
              name="area_sqm"
              disabled={pending}
              defaultValue={property.areaSqm}
              className={`${INPUT} tabular`}
            />
          </Field>

          <Field label="ชั้น">
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

          <Field label="ไลน์ติดต่อ">
            <input
              type="text"
              name="contact_line"
              maxLength={100}
              disabled={pending}
              defaultValue={property.contactLine ?? ''}
              className={INPUT}
            />
          </Field>

          <Field label="รายละเอียด" wide>
            <textarea
              name="description"
              rows={4}
              maxLength={4000}
              disabled={pending}
              defaultValue={property.description ?? ''}
              placeholder="เฟอร์นิเจอร์ วิว เงื่อนไขการเช่า"
              className={INPUT}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="รูปภาพ"
        note={`ไม่เกิน ${MAX_IMAGES} รูป รูปละไม่เกิน ${mb(MAX_IMAGE_BYTES)} MB เพิ่มครั้งละไม่เกิน ${mb(
          MAX_IMAGES_TOTAL_BYTES,
        )} MB`}
      >
        <div className="flex flex-col gap-3">
          {photos.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">
                รูปเดิม <span className="tabular text-muted">{keptCount} รูป</span>
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
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photo.url}
                          alt={`รูปที่ ${index + 1}`}
                          className={
                            'h-24 w-24 rounded-lg border object-cover transition-opacity ' +
                            (marked ? 'border-warn/60 opacity-30' : 'border-border')
                          }
                        />
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
                          จะถูกลบ
                        </span>
                      )}

                      <button
                        type="button"
                        disabled={pending}
                        aria-label={marked ? `เอารูปที่ ${index + 1} กลับมา` : `เอารูปที่ ${index + 1} ออก`}
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
                  รูปที่เลือกไว้จะถูกลบเมื่อกดบันทึก — กดปุ่มย้อนกลับบนรูปเพื่อเก็บไว้เหมือนเดิม
                </p>
              )}
            </div>
          )}

          <label className={`${BUTTON} inline-flex w-fit cursor-pointer items-center gap-2`}>
            <ImagePlus size={16} aria-hidden />
            เพิ่มรูป
            <input
              key={storedKey}
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
                  <li key={src}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`รูปใหม่ที่ ${index + 1}`}
                      className="h-24 w-24 rounded-lg border border-border object-cover"
                    />
                  </li>
                ))}
              </ul>
              <p className="flex items-center gap-3 text-sm text-muted">
                <span className="tabular">
                  รูปใหม่ {files.length} รูป · รวม {mb(totalBytes)} MB
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
                  เอารูปใหม่ออกทั้งหมด
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
          {pending ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข'}
        </button>
        <Link
          href={`/o/${slug}/properties`}
          className={`${BUTTON} inline-flex items-center text-muted`}
        >
          ยกเลิก
        </Link>
        <Notice result={result} />
      </div>
    </form>
  )
}
