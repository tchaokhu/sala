'use client'

// The write halves of จัดการโครงการ.
//
// Editing is behind a <details>, so a page of twenty โครงการ reads as a list
// rather than twenty open forms — and the summary line stays the thing you scan.
//
// Deleting takes two clicks and the second one says what it destroys, with the
// number (CLAUDE.md). No confirm() dialog: a modal that blocks the page is
// worse than a button that changes its mind.

import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { BUTTON, INPUT, Notice, PRIMARY_BUTTON, useFormAction } from '@/components/form'
import type { BuildingRow } from '@/lib/buildings'
import { createBuilding, deleteBuilding, updateBuilding } from './actions'

const MAP_HINT = 'วางลิงก์จากปุ่มแชร์ในแอป Google Maps ได้เลย ลิงก์สั้น (maps.app.goo.gl) ก็ได้'

export function CreateBuildingForm({ slug }: { slug: string }) {
  const [result, action, pending] = useFormAction(createBuilding)

  return (
    <form action={action} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      <div>
        <h2 className="font-semibold">เพิ่มโครงการ</h2>
        <p className="mt-1 text-sm text-muted">
          ชื่อโครงการจะกลายเป็นชื่อทรัพย์ เช่น “ลุมพินี พาร์ค พระราม 9 12/34”
        </p>
      </div>

      <input type="hidden" name="slug" value={slug} />
      <Fields pending={pending} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? 'กำลังบันทึก…' : 'เพิ่มโครงการ'}
        </button>
        <Notice result={result} />
      </div>
    </form>
  )
}

export function BuildingRowForms({ slug, building }: { slug: string; building: BuildingRow }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <details className="group">
        <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
          <Pencil size={14} aria-hidden />
          แก้ไขโครงการ
        </summary>
        <EditForm slug={slug} building={building} />
      </details>

      <DeleteForm slug={slug} building={building} />
    </div>
  )
}

function EditForm({ slug, building }: { slug: string; building: BuildingRow }) {
  const [result, action, pending] = useFormAction(updateBuilding)

  return (
    <form action={action} className="mt-3 flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="building_id" value={building.id} />
      <Fields pending={pending} building={building} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
        <Notice result={result} />
      </div>
    </form>
  )
}

function DeleteForm({ slug, building }: { slug: string; building: BuildingRow }) {
  const [result, action, pending] = useFormAction(deleteBuilding)
  const [armed, setArmed] = useState(false)

  if (!armed) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-warn"
        >
          <Trash2 size={14} aria-hidden />
          ลบโครงการ
        </button>
        <Notice result={result} />
      </div>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-2 rounded-lg border border-warn/40 bg-warn/5 p-3">
      <p className="text-sm">
        ลบ <span className="font-semibold">{building.name}</span> ใช่ไหม?{' '}
        {building.propertyCount > 0 ? (
          <>
            ทรัพย์{' '}
            <span className="tabular font-semibold">{building.propertyCount}</span> รายการในโครงการนี้จะยังอยู่
            แต่จะไม่มีโครงการและไม่มีแผนที่
          </>
        ) : (
          'ยังไม่มีทรัพย์อยู่ในโครงการนี้'
        )}
      </p>

      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="building_id" value={building.id} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-warn px-3 py-2 text-sm font-medium text-warn transition-colors hover:bg-warn/10 disabled:opacity-60"
        >
          {pending ? 'กำลังลบ…' : 'ยืนยันลบโครงการ'}
        </button>
        <button type="button" onClick={() => setArmed(false)} className={BUTTON}>
          ยกเลิก
        </button>
        <Notice result={result} />
      </div>
    </form>
  )
}

/** The same five fields, for creating and for editing. */
function Fields({ pending, building }: { pending: boolean; building?: BuildingRow }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-medium">
          ชื่อโครงการ<span className="ml-1 text-warn">*</span>
        </span>
        <input
          type="text"
          name="name"
          required
          maxLength={200}
          disabled={pending}
          defaultValue={building?.name ?? ''}
          placeholder="เช่น ลุมพินี พาร์ค พระราม 9"
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">ชื่อภาษาอังกฤษ</span>
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
        <span className="text-sm font-medium">เขต / อำเภอ</span>
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
        <span className="text-sm font-medium">จังหวัด</span>
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
        <span className="text-sm font-medium">ลิงก์แผนที่ Google Maps</span>
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
