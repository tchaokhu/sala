'use client'

import { useActionState, useState } from 'react'
import {
  addMember,
  removeMember,
  setMemberDisplayName,
  setMemberRole,
} from '../../actions'
import type { ActionResult, AdminMember } from '../../types'

// The console's interactive parts. Everything here posts to a Server Action that
// re-establishes the caller for itself — none of these components is a check,
// and disabling a button is a courtesy rather than a control.

/** useActionState wants (previousState, formData); the actions take the form
 *  alone, because nothing they do depends on what happened last time. */
function useFormAction(action: (formData: FormData) => Promise<ActionResult>) {
  return useActionState(
    async (_previous: ActionResult | null, formData: FormData) => action(formData),
    null,
  )
}

function Notice({ result }: { result: ActionResult | null }) {
  if (!result) return null
  return (
    <p
      role="status"
      className={`text-sm ${result.ok ? 'text-ok' : 'text-warn'}`}
    >
      {result.message}
    </p>
  )
}

const INPUT =
  'rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60'

const BUTTON =
  'rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:text-ink disabled:opacity-60'

export function AddMemberForm({
  orgId,
  slug,
  orgName,
}: {
  orgId: string
  slug: string
  orgName: string
}) {
  const [result, action, pending] = useFormAction(addMember)

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div>
        <h2 className="font-semibold">เพิ่มสมาชิกเข้า {orgName}</h2>
        <p className="mt-1 text-sm text-muted">
          ถ้าอีเมลนี้ยังไม่มีบัญชี ระบบจะสร้างให้และส่งอีเมลเชิญไป
        </p>
      </div>

      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="slug" value={slug} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">อีเมล</span>
          <input
            type="email"
            name="email"
            required
            disabled={pending}
            placeholder="somchai@agency.co.th"
            className={INPUT}
          />
        </label>

        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">ชื่อที่แสดง</span>
          <input
            type="text"
            name="display_name"
            maxLength={80}
            disabled={pending}
            placeholder="ไม่ใส่ก็ได้ จะแสดงเป็นอีเมล"
            className={INPUT}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">สิทธิ์</span>
          <select name="role" defaultValue="member" disabled={pending} className={INPUT}>
            <option value="member">สมาชิก</option>
            <option value="owner">เจ้าของ</option>
          </select>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-3 py-2 font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? 'กำลังเพิ่ม…' : 'เพิ่มสมาชิก'}
        </button>
        <Notice result={result} />
      </div>
    </form>
  )
}

export function MemberRow({
  member,
  orgId,
  slug,
  orgName,
  isLastOwner,
}: {
  member: AdminMember
  orgId: string
  slug: string
  orgName: string
  isLastOwner: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <li className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-semibold">
            {member.display_name ?? member.email}
          </span>
          {member.display_name && (
            <span className="truncate text-xs text-muted">{member.email}</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <RolePill role={member.role} />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={BUTTON + ' text-muted'}
          >
            {open ? 'ปิด' : 'จัดการ'}
          </button>
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
          <RenameForm member={member} orgId={orgId} slug={slug} />
          <RoleForm member={member} orgId={orgId} slug={slug} isLastOwner={isLastOwner} />
          <RemoveForm
            member={member}
            orgId={orgId}
            slug={slug}
            orgName={orgName}
            isLastOwner={isLastOwner}
          />
        </div>
      )}
    </li>
  )
}

/** Role reads as shape as well as colour — a filled key for an owner, an
 *  outline for a member — so the column scans without comparing shades
 *  (CLAUDE.md). The teak accent stays out of it. */
function RolePill({ role }: { role: AdminMember['role'] }) {
  const owner = role === 'owner'
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ' +
        (owner ? 'border-ok/40 text-ok' : 'border-border text-muted')
      }
    >
      <span aria-hidden>{owner ? '●' : '○'}</span>
      {owner ? 'เจ้าของ' : 'สมาชิก'}
    </span>
  )
}

function RenameForm({
  member,
  orgId,
  slug,
}: {
  member: AdminMember
  orgId: string
  slug: string
}) {
  const [result, action, pending] = useFormAction(setMemberDisplayName)

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="user_id" value={member.user_id} />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">ชื่อที่แสดง</span>
        <div className="flex gap-2">
          <input
            type="text"
            name="display_name"
            maxLength={80}
            defaultValue={member.display_name ?? ''}
            disabled={pending}
            placeholder="เว้นว่างเพื่อแสดงเป็นอีเมล"
            className={INPUT + ' flex-1'}
          />
          <button type="submit" disabled={pending} className={BUTTON}>
            {pending ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </label>
      <Notice result={result} />
    </form>
  )
}

function RoleForm({
  member,
  orgId,
  slug,
  isLastOwner,
}: {
  member: AdminMember
  orgId: string
  slug: string
  isLastOwner: boolean
}) {
  const [result, action, pending] = useFormAction(setMemberRole)
  const next = member.role === 'owner' ? 'member' : 'owner'
  const blocked = isLastOwner && next === 'member'

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="user_id" value={member.user_id} />
      <input type="hidden" name="role" value={next} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || blocked} className={BUTTON}>
          {next === 'owner' ? 'ตั้งเป็นเจ้าของ' : 'ลดเป็นสมาชิก'}
        </button>
        <span className="text-sm text-muted">
          {next === 'owner'
            ? 'เจ้าของเพิ่มและเอาสมาชิกออกจากเอเจนซี่นี้ได้'
            : 'สมาชิกเห็นข้อมูลทั้งหมด แต่จัดการคนไม่ได้'}
        </span>
      </div>

      {blocked && (
        <p className="text-sm text-muted">
          เป็นเจ้าของคนสุดท้าย ตั้งคนอื่นเป็นเจ้าของก่อน
        </p>
      )}
      <Notice result={result} />
    </form>
  )
}

/** Two steps, and the first one says what the second destroys — including what
 *  it does *not* destroy, because "ลบ" next to a person reads as deleting them
 *  (CLAUDE.md: destructive actions say what they destroy). */
function RemoveForm({
  member,
  orgId,
  slug,
  orgName,
  isLastOwner,
}: {
  member: AdminMember
  orgId: string
  slug: string
  orgName: string
  isLastOwner: boolean
}) {
  const [result, action, pending] = useFormAction(removeMember)
  const [confirming, setConfirming] = useState(false)
  const who = member.display_name ?? member.email

  if (isLastOwner) {
    return (
      <p className="text-sm text-muted">
        เอาเจ้าของคนสุดท้ายออกไม่ได้ — เอเจนซี่จะไม่เหลือใครจัดการสมาชิก
      </p>
    )
  }

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={BUTTON + ' self-start border-warn text-warn'}
        >
          เอาออกจากเอเจนซี่
        </button>
        <Notice result={result} />
      </div>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-warn p-3">
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="user_id" value={member.user_id} />

      <div className="text-sm">
        <p className="font-semibold text-warn">เอา {who} ออกจาก {orgName}?</p>
        <p className="mt-1 text-muted">
          เขาจะเข้าถึงข้อมูลของเอเจนซี่นี้ไม่ได้อีก บัญชีและอีเมลยังอยู่
          และสิทธิ์ในเอเจนซี่อื่นไม่เปลี่ยน เพิ่มกลับเข้ามาใหม่ได้ทุกเมื่อ
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-warn px-3 py-2 text-sm text-warn transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? 'กำลังเอาออก…' : 'ยืนยัน เอาออก'}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className={BUTTON}>
          ยกเลิก
        </button>
      </div>
      <Notice result={result} />
    </form>
  )
}
