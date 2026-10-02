'use client'

// Where this room has been advertised — a tick per channel, and a link where
// there is one to keep.
//
// The whole list posts as a single JSON field rather than a field per Platform
// id, so the action does not have to guess which of the form's keys are ids.
// `parsePostingsField` in lib/postings.ts is the other half of that contract.
//
// Un-ticking removes the row (0011). There is no "meant to post it" state, so
// the box means the advertisement exists — nothing else.

import { startTransition, useState } from 'react'
import Link from 'next/link'
import { INPUT, Notice, PRIMARY_BUTTON, useFormAction } from '@/components/form'
import type { PlatformOption } from '@/lib/platforms'
import type { PostingRow } from '@/lib/postings'
import { updatePostings } from '@/app/o/[slug]/properties/[id]/actions'
import { PANEL } from './styles'

interface Ticked {
  postUrl: string
  postedOn: string
}

export function PostingChecklist({
  slug,
  propertyId,
  platforms,
  capped,
  current,
  today,
}: {
  slug: string
  propertyId: string
  platforms: PlatformOption[]
  capped: boolean
  current: PostingRow[]
  /** Bangkok's today, resolved on the server — a browser in another timezone
   *  must not decide what "today" means (CLAUDE.md). */
  today: string
}) {
  const [ticks, setTicks] = useState<Record<string, Ticked>>(() =>
    Object.fromEntries(
      current.map((p) => [p.platformId, { postUrl: p.postUrl ?? '', postedOn: p.postedOn }]),
    ),
  )
  const [result, action, pending] = useFormAction(updatePostings)

  const toggle = (id: string) =>
    setTicks((prev) => {
      if (id in prev) {
        const { [id]: _removed, ...rest } = prev
        return rest
      }
      return { ...prev, [id]: { postUrl: '', postedOn: today } }
    })

  const patch = (id: string, next: Partial<Ticked>) =>
    setTicks((prev) => (id in prev ? { ...prev, [id]: { ...prev[id], ...next } } : prev))

  const payload = JSON.stringify(
    Object.entries(ticks).map(([platformId, t]) => ({
      platformId,
      postUrl: t.postUrl,
      postedOn: t.postedOn,
    })),
  )

  if (platforms.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center">
        <p className="font-semibold">No channels yet</p>
        <p className="mt-1 text-sm text-muted">
          Add the places you advertise — Facebook, Livinginsider, a LINE group — on the
          <Link
            href={`/o/${slug}/platforms`}
            className="ml-1 text-accent underline-offset-4 hover:underline"
          >
            Platforms page
          </Link>
          , then come back and tick them here.
        </p>
      </div>
    )
  }

  return (
    // Submitted by hand rather than through `action=`: React resets a form once
    // its action settles, and a reset puts every checkbox back to unticked —
    // React keeps a controlled text input's `value` attribute in step but not a
    // checkbox's `checked`. The ticks would then disagree with the state that
    // builds the payload. The payload needs JS anyway, so nothing is lost.
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        startTransition(() => action(formData))
      }}
      className={`flex flex-col gap-4 ${PANEL}`}
    >
      <div>
        <h2 className="font-semibold">Where this room is posted</h2>
        <p className="mt-1 text-sm text-muted">
          Tick a channel once the advertisement is actually up. Un-ticking removes it.
        </p>
      </div>

      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="property_id" value={propertyId} />
      <input type="hidden" name="postings" value={payload} />

      <ul className="flex flex-col gap-2">
        {platforms.map((p) => {
          const tick = ticks[p.id]
          return (
            <li key={p.id} className="rounded-lg border border-border p-3">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={tick != null}
                  onChange={() => toggle(p.id)}
                  disabled={pending}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {p.name}
              </label>

              {tick && (
                <div className="mt-3 grid gap-3 pl-7 sm:grid-cols-[1fr_auto]">
                  <input
                    type="url"
                    value={tick.postUrl}
                    onChange={(e) => patch(p.id, { postUrl: e.target.value })}
                    disabled={pending}
                    placeholder="Link to the post (optional)"
                    aria-label={`Link to the ${p.name} post`}
                    className={INPUT}
                  />
                  <input
                    type="date"
                    value={tick.postedOn}
                    onChange={(e) => patch(p.id, { postedOn: e.target.value || today })}
                    disabled={pending}
                    aria-label={`Date posted to ${p.name}`}
                    className={`${INPUT} tabular`}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {capped && (
        <p className="text-xs text-muted">
          Showing the first {platforms.length} channels. Manage the rest on the{' '}
          <Link
            href={`/o/${slug}/platforms`}
            className="text-accent underline-offset-4 hover:underline"
          >
            Platforms page
          </Link>
          .
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? 'Saving…' : 'Save channels'}
        </button>
        <Notice result={result} />
      </div>
    </form>
  )
}
