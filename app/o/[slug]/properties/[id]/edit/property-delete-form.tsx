'use client'

// Removing a Property, in two clicks.
//
// The same shape as จัดการโครงการ's DeleteForm: a plain trigger that arms, and a
// second button that says what it destroys with the number (CLAUDE.md). No
// confirm() dialog — a modal that blocks the page is worse than a button that
// changes its mind.
//
// What it cannot do is said before the click rather than after: a Property with
// a Rental or a Payment behind it is refused by Postgres, and the action's Thai
// for that arrives through the ordinary Notice. It explains and stops there —
// there is no Rental-management flow to send anybody to yet (ADR 0009).

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { BUTTON, Card, Notice, useFormAction } from '@/components/form'
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
  const [result, action, pending] = useFormAction(deleteProperty)
  const [armed, setArmed] = useState(false)

  return (
    <Card
      title="ลบทรัพย์"
      note="ลบแล้วกู้คืนไม่ได้ และทรัพย์ที่เคยมีสัญญาเช่าหรือรายการเงินจะลบไม่ได้"
    >
      {!armed ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setArmed(true)}
            className="inline-flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-warn"
          >
            <Trash2 size={14} aria-hidden />
            ลบทรัพย์นี้
          </button>
          <Notice result={result} />
        </div>
      ) : (
        <form
          action={action}
          className="flex flex-col gap-2 rounded-lg border border-warn/40 bg-warn/5 p-3"
        >
          <p className="text-sm">
            ลบ <span className="font-semibold">{title}</span> ใช่ไหม?{' '}
            {photoCount > 0 ? (
              <>
                รูป <span className="tabular font-semibold">{photoCount}</span>{' '}
                รูปของทรัพย์นี้จะถูกลบไปด้วย
              </>
            ) : (
              'ทรัพย์นี้ยังไม่มีรูป'
            )}
          </p>

          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="property_id" value={propertyId} />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg border border-warn px-3 py-2 text-sm font-medium text-warn transition-colors hover:bg-warn/10 disabled:opacity-60"
            >
              {pending ? 'กำลังลบ…' : 'ยืนยันลบทรัพย์'}
            </button>
            <button type="button" onClick={() => setArmed(false)} className={BUTTON}>
              ยกเลิก
            </button>
            <Notice result={result} />
          </div>
        </form>
      )}
    </Card>
  )
}
