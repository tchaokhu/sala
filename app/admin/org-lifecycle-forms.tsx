'use client'

// Removing an Org, and putting one back.
//
// Removal asks in the confirm dialog every delete uses (ConfirmAction), and
// says what it does, with the number of people it does it to.
//
// What it says is unusual for a delete, and deliberately so — nothing is
// destroyed here. Access stops at once, with no read-only grace period (ADR
// 0010), and the Org stays restorable for ORG_RECOVERY_DAYS. Both halves of
// that have to be in the sentence: an operator who reads only "recoverable"
// will not expect the agency to be locked out mid-afternoon.
//
// Restore is one click. It is the undo, and undoing it again is this same
// button's neighbour.

import { RotateCcw, Trash2 } from 'lucide-react'
import { BUTTON, Notice, PRIMARY_BUTTON, useFormAction } from '@/components/form'
import { ConfirmAction } from '@/components/ConfirmAction'
import { ORG_RECOVERY_DAYS } from '@/lib/org-input'
import { restoreOrg, softDeleteOrg } from './actions'

export function DeleteOrgForm({
  orgId,
  slug,
  orgName,
  memberCount,
}: {
  orgId: string
  slug: string
  orgName: string
  memberCount: number
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div>
        <h2 className="font-semibold">Remove Org</h2>
        <p className="mt-1 text-sm text-muted">
          Closes {orgName} to everybody in it straight away, and keeps it restorable — from this
          console only — for {ORG_RECOVERY_DAYS} days.
        </p>
      </div>

      <ConfirmAction
        action={softDeleteOrg}
        fields={{ org_id: orgId, slug }}
        trigger={
          <>
            <Trash2 size={14} aria-hidden />
            Remove this Org
          </>
        }
        title="Remove Org"
        confirmLabel="Remove the Org"
        pendingLabel="Removing…"
      >
        <p>
          Remove <span className="font-semibold">{orgName}</span>?{' '}
          {memberCount === 1 ? (
            <>
              Its <span className="tabular font-semibold">1</span> Member loses access
            </>
          ) : (
            <>
              All <span className="tabular font-semibold">{memberCount}</span> of its Members lose
              access
            </>
          )}{' '}
          the moment you confirm — every Property, Rental, Payment and Tenant in it, with no
          read-only period first.
        </p>
        <p className="text-muted">
          Nothing is deleted yet. You can restore it here for{' '}
          <span className="tabular">{ORG_RECOVERY_DAYS}</span> days; after that it is purged along
          with everything in it, and that cannot be undone.
        </p>
      </ConfirmAction>
    </section>
  )
}

export function RestoreOrgForm({
  orgId,
  slug,
  orgName,
  /** The Org's page has nothing else to offer while it is removed, so restore is
   *  the one action that page is for and takes the accent. In the list it is one
   *  row among many and stays a plain button. */
  prominent = false,
}: {
  orgId: string
  slug: string
  orgName: string
  prominent?: boolean
}) {
  const [result, action, pending] = useFormAction(restoreOrg)

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="slug" value={slug} />

      <button
        type="submit"
        disabled={pending}
        className={
          (prominent ? PRIMARY_BUTTON : BUTTON) + ' inline-flex items-center gap-1.5 shrink-0'
        }
      >
        <RotateCcw size={14} aria-hidden />
        {pending ? 'Restoring…' : 'Restore'}
        <span className="sr-only"> {orgName}</span>
      </button>
      <Notice result={result} />
    </form>
  )
}
