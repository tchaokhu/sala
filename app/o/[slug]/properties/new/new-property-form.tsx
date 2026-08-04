'use client'

// The add-a-Property form.
//
// The judgement is not here — it is in lib/property-input.ts, which the Server
// Action runs on the values that actually arrive. This runs the same functions
// early so the common mistakes (nine photos, a 6 MB one) are caught before the
// bytes cross the network, and so the message a person reads is the same one
// either way.
//
// Photos are previewed from object URLs, because nothing in Sala renders a
// Property's images yet: the bucket is private and there is no detail page. Left
// without a preview, somebody would upload five photos and have no way of seeing
// that they were the right five.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ImagePlus, MapPin, X } from 'lucide-react'
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
import type { BuildingOption } from '@/lib/buildings'
import {
  ACCEPTED_IMAGE_TYPES,
  CREATABLE_STATUSES,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_TOTAL_BYTES,
  mb,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  validateImages,
} from '@/lib/property-input'
import { STATUS_LABELS } from '@/components/StatusPill'
import { createProperty } from '../actions'

export function NewPropertyForm({
  slug,
  buildings,
  buildingsCapped,
}: {
  slug: string
  buildings: BuildingOption[]
  buildingsCapped: boolean
}) {
  const [result, action, pending] = useFormAction(createProperty)
  const [files, setFiles] = useState<File[]>([])
  const [building, setBuilding] = useState<BuildingOption | null>(null)

  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  const imageCheck = validateImages(files)
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0)

  return (
    <form action={action} className="flex flex-col gap-6">
      {/* Names which Org to resolve. It is not where the Org comes from — the
          action reads that from the session through requireMember (ADR 0002),
          so editing this field gets a refusal, not another agency's books. */}
      <input type="hidden" name="slug" value={slug} />

      <Card
        title="โครงการและห้อง"
        note="ชื่อทรัพย์คือชื่อโครงการต่อด้วยเลขห้อง จึงไม่ต้องพิมพ์ชื่อทรัพย์เอง"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="โครงการ"
            required
            hint="ไม่มีในรายการก็พิมพ์ชื่อใหม่ได้ ระบบจะสร้างโครงการให้"
            wide
          >
            <BuildingCombobox
              options={buildings}
              capped={buildingsCapped}
              disabled={pending}
              onChoose={setBuilding}
            />
          </Field>

          <Field label="เลขห้อง" hint="เว้นว่างได้ ถ้าเป็นบ้านทั้งหลัง">
            <input
              type="text"
              name="room_number"
              maxLength={40}
              disabled={pending}
              placeholder="12/34"
              className={INPUT}
            />
          </Field>

          <Field label="ประเภท" required>
            <select name="property_type" required disabled={pending} defaultValue="condo" className={INPUT}>
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
              placeholder="18000"
              className={`${INPUT} tabular text-right`}
            />
          </Field>

          <Field label="สถานะเริ่มต้น" hint='ทรัพย์จะเป็น "มีผู้เช่า" เมื่อสร้างสัญญาเช่าเท่านั้น'>
            <select name="status" disabled={pending} defaultValue="available" className={INPUT}>
              {CREATABLE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </Field>

        </div>

        {/* The map belongs to the โครงการ, so it appears as soon as one is
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
              placeholder="0"
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
              placeholder="0"
              className={`${INPUT} tabular`}
            />
          </Field>

          <Field label="ขนาด (ตร.ม.)">
            <input
              type="text"
              inputMode="decimal"
              name="area_sqm"
              disabled={pending}
              placeholder="0"
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
              className={`${INPUT} tabular`}
            />
          </Field>

          {/* No ที่ตั้ง, เขต or จังหวัด here: those describe the โครงการ, and
              they are entered once on it rather than on every unit inside. */}
          <Field label="ไลน์ติดต่อ">
            <input type="text" name="contact_line" maxLength={100} disabled={pending} className={INPUT} />
          </Field>

          <Field label="รายละเอียด" wide>
            <textarea
              name="description"
              rows={4}
              maxLength={4000}
              disabled={pending}
              placeholder="เฟอร์นิเจอร์ วิว เงื่อนไขการเช่า"
              className={INPUT}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="รูปภาพ"
        note={`ไม่เกิน ${MAX_IMAGES} รูป รูปละไม่เกิน ${mb(MAX_IMAGE_BYTES)} MB รวมกันไม่เกิน ${mb(
          MAX_IMAGES_TOTAL_BYTES,
        )} MB`}
      >
        <div className="flex flex-col gap-3">
          <label className={`${BUTTON} inline-flex w-fit cursor-pointer items-center gap-2`}>
            <ImagePlus size={16} aria-hidden />
            เลือกรูป
            <input
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
                    {/* Local object URLs, never through next/image: there is no
                        remote host to optimise and no size known in advance. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`รูปที่ ${index + 1}`}
                      className="h-24 w-24 rounded-lg border border-border object-cover"
                    />
                  </li>
                ))}
              </ul>
              <p className="flex items-center gap-3 text-sm text-muted">
                <span className="tabular">
                  {files.length} รูป · รวม {mb(totalBytes)} MB
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
                  เอารูปออกทั้งหมด
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
          {pending ? 'กำลังบันทึก…' : 'บันทึกทรัพย์'}
        </button>
        <Notice result={result} />
      </div>
    </form>
  )
}
