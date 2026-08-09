import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { formatDateThai } from '@/lib/format'
import { ORG_RECOVERY_DAYS } from '@/lib/org-input'
import { adminOrgBySlug, listMembers } from '../../data'
import { DeleteOrgForm, RestoreOrgForm } from '../../org-lifecycle-forms'
import { bangkokDay, recoveryDaysLeft } from '../../org-recovery'
import { AddMemberForm, MemberRow } from './member-forms'

// One Org's people, and the Org's own life cycle. Everything a Superadmin may do
// to an Org lives on this page, which is the whole console: add somebody, change
// what they may do, change what they are called, take them out again — and take
// the Org itself out, or put it back.
//
// What is deliberately absent: this Org's Properties, Rentals, Payments, Tenants
// and Inquiries. The operator does not get a window into an agency's books
// (ADR 0006) — the page shows who can open that window, not what is inside it.
export default async function AdminOrgPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const org = await adminOrgBySlug(slug)
  if (!org) notFound()

  // A removed Org has no page worth rendering: its Members cannot reach it, so
  // adding or renaming one of them would be managing a room nobody can enter.
  // Restore is the only thing on offer, and the reason the Member list is not
  // fetched at all. Nobody but the operator ever sees this — is_member() hides
  // the row from everybody else (ADR 0010).
  if (org.deleted_at) {
    const daysLeft = recoveryDaysLeft(org.deleted_at)

    return (
      <div className="flex flex-col gap-6">
        <OrgHeading name={org.name} slug={org.slug} />

        <section className="flex flex-col gap-3 rounded-lg border border-dashed border-warn/50 bg-surface p-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-warn">
              <Trash2 size={16} aria-hidden />
              Pending deletion
            </h2>
            <p className="mt-1 text-sm text-muted">
              Removed on {formatDateThai(bangkokDay(org.deleted_at))}. Its Members have no access
              to it and cannot see that it exists.
            </p>
          </div>

          <p className="text-sm">
            {daysLeft === 0 ? (
              <>
                The {ORG_RECOVERY_DAYS}-day window has run out. The next run of{' '}
                <span className="font-mono text-xs">scripts/purge-deleted-orgs.mjs</span> takes
                this Org and everything in it, for good — restore it now if it should stay.
              </>
            ) : (
              <>
                <span className="tabular font-semibold">{daysLeft}</span>{' '}
                {daysLeft === 1 ? 'day' : 'days'} left to restore it. After that it is purged
                along with every Property, Rental, Payment and Tenant in it, and that cannot be
                undone.
              </>
            )}
          </p>

          <RestoreOrgForm orgId={org.id} slug={org.slug} orgName={org.name} prominent />
        </section>
      </div>
    )
  }

  const members = await listMembers(org.id)
  const admins = members.filter((m) => m.role === 'admin').length

  return (
    <div className="flex flex-col gap-6">
      <OrgHeading name={org.name} slug={org.slug} />

      <div>
        <h2 className="text-sm font-semibold text-muted">
          <span className="tabular">{members.length}</span> Members ·{' '}
          <span className="tabular">{admins}</span> Admins
        </h2>

        {admins === 0 && members.length > 0 && (
          <p className="mt-2 rounded-lg border border-warn bg-surface p-3 text-sm">
            <span className="font-semibold text-warn">This Org has no Admin</span>
            <span className="mt-1 block text-muted">
              Nobody inside it can add or remove Members. Make one of them an Admin.
            </span>
          </p>
        )}

        <ul className="mt-3 flex flex-col gap-2">
          {members.map((member) => (
            <MemberRow
              key={member.user_id}
              member={member}
              orgId={org.id}
              slug={org.slug}
              orgName={org.name}
              isLastAdmin={member.role === 'admin' && admins === 1}
            />
          ))}
        </ul>

        {members.length === 0 && (
          <p className="mt-3 rounded-lg border border-border bg-surface p-4 text-sm text-muted">
            No Members yet. Add the first one as an Admin below.
          </p>
        )}
      </div>

      <AddMemberForm orgId={org.id} slug={org.slug} orgName={org.name} />

      <DeleteOrgForm
        orgId={org.id}
        slug={org.slug}
        orgName={org.name}
        memberCount={members.length}
      />
    </div>
  )
}

function OrgHeading({ name, slug }: { name: string; slug: string }) {
  return (
    <div>
      <Link href="/admin" className="text-sm text-muted transition-colors hover:text-ink">
        ← All Orgs
      </Link>
      <h1 className="mt-2 text-xl font-bold">{name}</h1>
      <p className="mt-1 font-mono text-xs text-muted">{slug}</p>
    </div>
  )
}
