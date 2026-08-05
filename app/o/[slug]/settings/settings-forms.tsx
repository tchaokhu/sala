'use client'

import { BUTTON, INPUT, Notice, useFormAction } from '@/components/form'
import { changeOwnEmail, renameSelf } from './actions'

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
        <h2 className="font-semibold">Display name</h2>
        <p className="mt-1 text-sm text-muted">
          This name is used only in {orgName}. Colleagues here see it instead of your email.
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
          placeholder="Leave blank to show your email"
          className={INPUT + ' flex-1'}
        />
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending ? 'Saving…' : 'Save'}
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
        <h2 className="font-semibold">Sign-in email</h2>
        <p className="mt-1 text-sm text-muted">
          Currently <span className="font-medium text-ink">{email}</span> — after a change you have
          to confirm it by email before the new address can sign in.
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
          {pending ? 'Sending…' : 'Change email'}
        </button>
      </div>
      <Notice result={result} />
    </form>
  )
}
