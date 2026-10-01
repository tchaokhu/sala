'use client'

import { useState } from 'react'
import { Circle } from 'lucide-react'
import { BUTTON, INPUT, Notice, PRIMARY_BUTTON, useFormAction } from '@/components/form'
import { ConfirmAction } from '@/components/ConfirmAction'
import {
  addMember,
  removeMember,
  setMemberDisplayName,
  setMemberRole,
} from '../../actions'
import type { AdminMember } from '../../types'

// The console's interactive parts. Everything here posts to a Server Action that
// re-establishes the caller for itself — none of these components is a check,
// and disabling a button is a courtesy rather than a control.

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
        <h2 className="font-semibold">Add a Member to {orgName}</h2>
        <p className="mt-1 text-sm text-muted">
          If this email has no account yet, Sala creates one and sends an invitation.
        </p>
      </div>

      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="slug" value={slug} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Email</span>
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
          <span className="text-sm font-medium">Display name</span>
          <input
            type="text"
            name="display_name"
            maxLength={80}
            disabled={pending}
            placeholder="Optional — the email shows instead"
            className={INPUT}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Role</span>
          <select name="role" defaultValue="member" disabled={pending} className={INPUT}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? 'Adding…' : 'Add Member'}
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
  isLastAdmin,
}: {
  member: AdminMember
  orgId: string
  slug: string
  orgName: string
  isLastAdmin: boolean
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
            {open ? 'Close' : 'Manage'}
          </button>
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
          <RenameForm member={member} orgId={orgId} slug={slug} />
          <RoleForm member={member} orgId={orgId} slug={slug} isLastAdmin={isLastAdmin} />
          <RemoveForm
            member={member}
            orgId={orgId}
            slug={slug}
            orgName={orgName}
            isLastAdmin={isLastAdmin}
          />
        </div>
      )}
    </li>
  )
}

/** Role reads as shape as well as colour — a filled disc for an admin, a ring
 *  for a member — so the column scans without comparing shades (CLAUDE.md). The
 *  teak accent stays out of it. */
function RolePill({ role }: { role: AdminMember['role'] }) {
  const admin = role === 'admin'
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ' +
        (admin ? 'border-ok/40 text-ok' : 'border-border text-muted')
      }
    >
      <Circle size={12} aria-hidden fill={admin ? 'currentColor' : 'none'} />
      {admin ? 'Admin' : 'Member'}
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
        <span className="text-sm font-medium">Display name</span>
        <div className="flex gap-2">
          <input
            type="text"
            name="display_name"
            maxLength={80}
            defaultValue={member.display_name ?? ''}
            disabled={pending}
            placeholder="Leave blank to show the email"
            className={INPUT + ' flex-1'}
          />
          <button type="submit" disabled={pending} className={BUTTON}>
            {pending ? 'Saving…' : 'Save'}
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
  isLastAdmin,
}: {
  member: AdminMember
  orgId: string
  slug: string
  isLastAdmin: boolean
}) {
  const [result, action, pending] = useFormAction(setMemberRole)
  const next = member.role === 'admin' ? 'member' : 'admin'
  const blocked = isLastAdmin && next === 'member'

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="user_id" value={member.user_id} />
      <input type="hidden" name="role" value={next} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || blocked} className={BUTTON}>
          {next === 'admin' ? 'Make an Admin' : 'Demote to Member'}
        </button>
        <span className="text-sm text-muted">
          {next === 'admin'
            ? 'An Admin can add and remove Members of this Org.'
            : 'A Member sees all of the data, but cannot manage people.'}
        </span>
      </div>

      {blocked && (
        <p className="text-sm text-muted">
          The last Admin. Make somebody else an Admin first.
        </p>
      )}
      <Notice result={result} />
    </form>
  )
}

/** Asks in the confirm dialog every delete uses, and says what it destroys —
 *  including what it does *not* destroy, because "Remove" next to a person
 *  reads as deleting them (CLAUDE.md: destructive actions say what they destroy). */
function RemoveForm({
  member,
  orgId,
  slug,
  orgName,
  isLastAdmin,
}: {
  member: AdminMember
  orgId: string
  slug: string
  orgName: string
  isLastAdmin: boolean
}) {
  const who = member.display_name ?? member.email

  if (isLastAdmin) {
    return (
      <p className="text-sm text-muted">
        The last Admin cannot be removed — the Org would be left with nobody to manage its
        Members.
      </p>
    )
  }

  return (
    <ConfirmAction
      action={removeMember}
      fields={{ org_id: orgId, slug, user_id: member.user_id }}
      triggerClassName={BUTTON + ' self-start border-warn text-warn'}
      trigger="Remove from the Org"
      title="Remove Member"
      confirmLabel="Remove"
      pendingLabel="Removing…"
    >
      <p>
        Remove <span className="font-semibold">{who}</span> from {orgName}?
      </p>
      <p className="text-muted">
        They lose access to this Org&apos;s data. Their account and email stay, their roles in other
        Orgs do not change, and you can add them back at any time.
      </p>
    </ConfirmAction>
  )
}
