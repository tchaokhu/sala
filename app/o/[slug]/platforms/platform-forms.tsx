'use client'

// The write halves of the Platforms page.
//
// Editing is behind a <details>, the same as Buildings, so a page of ten
// channels reads as a list rather than ten open forms.
//
// There is no delete button, and its absence is the design: a channel with
// Postings cannot be removed — the database refuses it (0011) — and one
// without them is still something somebody may want back. Retire it instead,
// which says what actually happens to the rooms already posted there.

import { Pencil } from 'lucide-react'
import { BUTTON, Field, INPUT, Notice, PRIMARY_BUTTON, useFormAction } from '@/components/form'
import type { PlatformRow } from '@/lib/platforms'
import { createPlatform, setPlatformActive, updatePlatform } from './actions'
import { PANEL } from '@/components/styles'

export function CreatePlatformForm({ slug }: { slug: string }) {
  const [result, action, pending] = useFormAction(createPlatform)

  return (
    <form
      action={action}
      className={`flex flex-col gap-4 ${PANEL}`}
    >
      <div>
        <h2 className="font-semibold">Add a channel</h2>
        <p className="mt-1 text-sm text-muted">
          Anywhere you advertise — Facebook, Livinginsider, DDproperty, a LINE group.
        </p>
      </div>

      <input type="hidden" name="slug" value={slug} />
      <Fields pending={pending} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? 'Saving…' : 'Add channel'}
        </button>
        <Notice result={result} />
      </div>
    </form>
  )
}

export function PlatformRowForms({ slug, platform }: { slug: string; platform: PlatformRow }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <details className="group">
        <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
          <Pencil size={14} aria-hidden />
          Edit channel
        </summary>
        <EditForm slug={slug} platform={platform} />
      </details>

      <RetireForm slug={slug} platform={platform} />
    </div>
  )
}

function EditForm({ slug, platform }: { slug: string; platform: PlatformRow }) {
  const [result, action, pending] = useFormAction(updatePlatform)

  return (
    <form action={action} className="mt-3 flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="platform_id" value={platform.id} />
      <Fields pending={pending} platform={platform} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <Notice result={result} />
      </div>
    </form>
  )
}

/** Retiring says what it does to what already exists, which is nothing —
 *  the opposite of a delete, and the copy has to make that obvious. */
function RetireForm({ slug, platform }: { slug: string; platform: PlatformRow }) {
  const [result, action, pending] = useFormAction(setPlatformActive)
  const next = !platform.active

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="platform_id" value={platform.id} />
      <input type="hidden" name="active" value={String(next)} />
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? 'Saving…' : next ? 'Bring back' : 'Retire'}
      </button>
      <span className="text-xs text-muted">
        {next
          ? 'Puts it back on the Property form.'
          : platform.postingCount > 0
            ? `Takes it off the Property form. The ${platform.postingCount} ${
                platform.postingCount === 1 ? 'room' : 'rooms'
              } already posted there keep showing it.`
            : 'Takes it off the Property form. Nothing is posted there yet.'}
      </span>
      <Notice result={result} />
    </form>
  )
}

function Fields({ pending, platform }: { pending: boolean; platform?: PlatformRow }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_8rem_auto]">
      <Field label="Name" required>
        <input
          name="name"
          defaultValue={platform?.name ?? ''}
          required
          maxLength={60}
          disabled={pending}
          className={INPUT}
        />
      </Field>

      <Field label="Order">
        <input
          name="sort_order"
          type="number"
          min={0}
          max={999}
          defaultValue={platform?.sortOrder ?? 0}
          disabled={pending}
          className={`${INPUT} tabular`}
        />
        <span className="text-xs text-muted">Lowest first</span>
      </Field>

      <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
        <input
          name="active"
          type="checkbox"
          defaultChecked={platform?.active ?? true}
          disabled={pending}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        On the Property form
      </label>
    </div>
  )
}
