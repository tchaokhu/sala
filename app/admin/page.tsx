import Link from 'next/link'
import { listOrgs } from './data'
import type { AdminOrg } from './types'
import { CreateOrgForm } from './create-org-form'
import { RestoreOrgForm } from './org-lifecycle-forms'
import { recoveryDaysLeft } from './org-recovery'

// The console's landing screen: every Org, and how many people are in it.
//
// The counts come from the same statement as the rows (admin_orgs), not from
// fetching Memberships and calling .length — the habit CLAUDE.md names, applied
// here even though the numbers are small today. `deleted_at` rides along on that
// same row, so splitting the list in two costs no extra round-trip.
export default async function AdminHome() {
  const orgs = await listOrgs()
  const total = orgs[0]?.total ?? 0
  const active = orgs.filter((org) => !org.deleted_at)
  const pending = orgs.filter(
    (org): org is AdminOrg & { deleted_at: string } => org.deleted_at !== null,
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Orgs</h1>
        <p className="mt-1 flex h-5 items-center text-sm text-muted">
          {total} in total
          {pending.length > 0 && <> · {pending.length} pending deletion</>} · manage Members and
          their roles from here
        </p>
      </div>

      {active.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-4 text-sm">
          <p className="font-semibold">No Orgs yet</p>
          <p className="mt-1 text-muted">
            Create the first one below. Its first Admin is invited with it, and can add the rest
            of the agency from inside.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {active.map((org) => (
            <li key={org.id}>
              <Link
                href={`/admin/orgs/${org.slug}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-accent"
              >
                <div className="flex flex-col leading-tight">
                  <span className="font-semibold">{org.name}</span>
                  <span className="font-mono text-xs text-muted">{org.slug}</span>
                </div>
                <div className="text-right text-sm text-muted">
                  <span className="tabular">{org.member_count}</span> Members
                  {/* An Org with no admin cannot manage itself — nobody inside
                      it can add or remove anyone. Worth seeing from the list. */}
                  {org.admin_count === 0 && (
                    <span className="ml-2 rounded-full border border-warn px-2 py-0.5 text-xs text-warn">
                      No Admin
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CreateOrgForm />

      {/* Dashed, and set apart from the list above rather than mixed into it:
          these Orgs are not reachable by anyone but the operator reading this
          page, and a row that looks like the others invites a click that leads
          somewhere very different. */}
      {pending.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted">
            Pending deletion · <span className="tabular">{pending.length}</span>
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {pending.map((org) => {
              const daysLeft = recoveryDaysLeft(org.deleted_at)
              return (
                <li
                  key={org.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-warn/50 bg-surface px-4 py-3"
                >
                  <div className="flex min-w-0 flex-col leading-tight">
                    <Link
                      href={`/admin/orgs/${org.slug}`}
                      className="truncate font-semibold transition-colors hover:text-accent"
                    >
                      {org.name}
                    </Link>
                    <span className="font-mono text-xs text-muted">{org.slug}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm text-warn">
                      {daysLeft === 0 ? (
                        'Purged at the next run'
                      ) : (
                        <>
                          <span className="tabular">{daysLeft}</span>{' '}
                          {daysLeft === 1 ? 'day' : 'days'} left
                        </>
                      )}
                    </span>
                    <RestoreOrgForm orgId={org.id} slug={org.slug} orgName={org.name} />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {total > orgs.length && (
        <p className="text-sm text-muted">
          Showing {orgs.length} of {total} — add pagination when the list grows longer than this
        </p>
      )}
    </div>
  )
}
