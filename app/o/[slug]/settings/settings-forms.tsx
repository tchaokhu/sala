'use client'

import { useActionState } from 'react'
import type { ActionResult } from '@/lib/action-result'
import { changeOwnEmail, renameSelf } from './actions'

const INPUT =
  'rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60'

const BUTTON =
  'rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:text-ink disabled:opacity-60'

function useFormAction(action: (formData: FormData) => Promise<ActionResult>) {
  return useActionState(
    async (_previous: ActionResult | null, formData: FormData) => action(formData),
    null,
  )
}

function Notice({ result }: { result: ActionResult | null }) {
  if (!result) return null
  return (
    <p role="status" className={`text-sm ${result.ok ? 'text-ok' : 'text-warn'}`}>
      {result.message}
    </p>
  )
}

export function SettingsForms({
  slug,
  orgName,
  displayName,
  email,
}: {
  slug: string
  orgName: string
  displayName: string | null
  email: string
}) {
  return (
    <>
      <RenameForm slug={slug} orgName={orgName} displayName={displayName} />
      <EmailForm slug={slug} email={email} />
    </>
  )
}

function RenameForm({
  slug,
  orgName,
  displayName,
}: {
  slug: string
  orgName: string
  displayName: string | null
}) {
  const [result, action, pending] = useFormAction(renameSelf)

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div>
        <h2 className="font-semibold">ชื่อที่แสดง</h2>
        <p className="mt-1 text-sm text-muted">
          ชื่อนี้ใช้เฉพาะใน {orgName} เพื่อนร่วมงานที่นี่จะเห็นชื่อนี้แทนอีเมล
        </p>
      </div>

      <input type="hidden" name="slug" value={slug} />

      <div className="flex gap-2">
        <input
          type="text"
          name="display_name"
          maxLength={80}
          defaultValue={displayName ?? ''}
          disabled={pending}
          placeholder="เว้นว่างเพื่อแสดงเป็นอีเมล"
          className={INPUT + ' flex-1'}
        />
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </div>
      <Notice result={result} />
    </form>
  )
}

function EmailForm({ slug, email }: { slug: string; email: string }) {
  const [result, action, pending] = useFormAction(changeOwnEmail)

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div>
        <h2 className="font-semibold">อีเมลที่ใช้เข้าสู่ระบบ</h2>
        <p className="mt-1 text-sm text-muted">
          ตอนนี้คือ <span className="font-medium text-ink">{email}</span> —
          เปลี่ยนแล้วต้องกดยืนยันในอีเมลก่อน จึงจะใช้ที่อยู่ใหม่เข้าระบบได้
        </p>
      </div>

      <input type="hidden" name="slug" value={slug} />

      <div className="flex gap-2">
        <input
          type="email"
          name="email"
          required
          defaultValue={email}
          disabled={pending}
          className={INPUT + ' flex-1'}
        />
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending ? 'กำลังส่ง…' : 'เปลี่ยนอีเมล'}
        </button>
      </div>
      <Notice result={result} />
    </form>
  )
}
