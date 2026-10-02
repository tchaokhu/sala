'use client'

// The write half of the Owners pages: adding one on /owners/new, editing and
// deleting on the Owner's own page — the same shape as the Building forms.

import { Trash2 } from 'lucide-react'
import { ConfirmAction } from '@/components/ConfirmAction'
import { Field, INPUT, Notice, PRIMARY_BUTTON, useFormAction } from '@/components/form'
import { PANEL } from '@/components/styles'
import type { OwnerRow } from '@/lib/owners'
import { createOwner, deleteOwner, updateOwner } from './actions'

export function CreateOwnerForm({ slug }: { slug: string }) {
  const [result, action, pending] = useFormAction(createOwner)

  return (
    <form action={action} className={`flex flex-col gap-4 ${PANEL}`}>
      {/* Names which Org to resolve. It is not where the Org comes from — the
          action reads that from the session through requireMember (ADR 0002). */}
      <input type="hidden" name="slug" value={slug} />
      <Fields pending={pending} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? 'Saving…' : 'Save Owner'}
        </button>
        <Notice result={result} />
      </div>
    </form>
  )
}

export function EditOwnerForm({ slug, owner }: { slug: string; owner: OwnerRow }) {
  const [result, action, pending] = useFormAction(updateOwner)

  return (
    <form action={action} className={`flex flex-col gap-4 ${PANEL}`}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="owner_id" value={owner.id} />
      <Fields pending={pending} owner={owner} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        <Notice result={result} />
      </div>
    </form>
  )
}

/** Delete, through the one confirm dialog. On the Owner's page and on their row
 *  in the list. It says what it strands, with the number (CLAUDE.md). */
export function DeleteOwnerForm({
  slug,
  owner,
  compact,
}: {
  slug: string
  owner: Pick<OwnerRow, 'id' | 'name' | 'propertyCount'>
  compact?: boolean
}) {
  return (
    <ConfirmAction
      action={deleteOwner}
      fields={{ slug, owner_id: owner.id }}
      triggerLabel={`Delete ${owner.name}`}
      trigger={
        <>
          <Trash2 size={14} aria-hidden />
          {compact ? 'Delete' : 'Delete Owner'}
        </>
      }
      title="Delete Owner"
    >
      <p>
        Delete <span className="font-semibold">{owner.name}</span>?
      </p>
      <p>
        {owner.propertyCount > 0 ? (
          <>
            The <span className="tabular font-semibold">{owner.propertyCount}</span>{' '}
            {owner.propertyCount === 1 ? 'Property' : 'Properties'} they own will stay, with no Owner
            on file.
          </>
        ) : (
          'They own no Properties.'
        )}
      </p>
    </ConfirmAction>
  )
}

/** The same fields, for adding and for editing. */
function Fields({ pending, owner }: { pending: boolean; owner?: OwnerRow }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" required>
        <input
          type="text"
          name="name"
          required
          maxLength={200}
          disabled={pending}
          defaultValue={owner?.name ?? ''}
          placeholder="e.g. Somchai Rattanakul"
          className={INPUT}
        />
      </Field>

      <Field label="Phone">
        <input
          type="tel"
          name="phone"
          maxLength={40}
          disabled={pending}
          defaultValue={owner?.phone ?? ''}
          placeholder="081 234 5678"
          className={`${INPUT} tabular`}
        />
      </Field>

      <Field label="Email">
        <input
          type="email"
          name="email"
          maxLength={200}
          disabled={pending}
          defaultValue={owner?.email ?? ''}
          className={INPUT}
        />
      </Field>

      <Field label="LINE ID">
        <input
          type="text"
          name="line_id"
          maxLength={100}
          disabled={pending}
          defaultValue={owner?.lineId ?? ''}
          className={INPUT}
        />
      </Field>

      <Field label="Facebook link" wide>
        <input
          type="url"
          name="facebook_url"
          maxLength={2000}
          disabled={pending}
          defaultValue={owner?.facebookUrl ?? ''}
          placeholder="https://facebook.com/…"
          className={INPUT}
        />
      </Field>

      <Field label="Note" wide>
        <textarea
          name="note"
          rows={3}
          maxLength={2000}
          disabled={pending}
          defaultValue={owner?.note ?? ''}
          placeholder="How they prefer to be contacted, who else to call"
          className={INPUT}
        />
      </Field>
    </div>
  )
}
