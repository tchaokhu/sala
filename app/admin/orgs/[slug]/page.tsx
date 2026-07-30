import Link from 'next/link'
import { notFound } from 'next/navigation'
import { adminOrgBySlug, listMembers } from '../../data'
import { AddMemberForm, MemberRow } from './member-forms'

// One Org's people. Everything a Superadmin may do to an Org lives on this page,
// which is the whole console: add somebody, change what they may do, change what
// they are called, take them out again.
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

  const members = await listMembers(org.id)
  const owners = members.filter((m) => m.role === 'owner').length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin" className="text-sm text-muted transition-colors hover:text-ink">
          ← เอเจนซี่ทั้งหมด
        </Link>
        <h1 className="mt-2 text-xl font-bold">{org.name}</h1>
        <p className="mt-1 font-mono text-xs text-muted">{org.slug}</p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted">
          สมาชิก <span className="tabular">{members.length}</span> คน · เจ้าของ{' '}
          <span className="tabular">{owners}</span> คน
        </h2>

        {owners === 0 && members.length > 0 && (
          <p className="mt-2 rounded-lg border border-warn bg-surface p-3 text-sm">
            <span className="font-semibold text-warn">เอเจนซี่นี้ไม่มีเจ้าของ</span>
            <span className="mt-1 block text-muted">
              ไม่มีใครในเอเจนซี่เพิ่มหรือเอาสมาชิกออกได้ ตั้งสักคนเป็นเจ้าของ
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
              isLastOwner={member.role === 'owner' && owners === 1}
            />
          ))}
        </ul>

        {members.length === 0 && (
          <p className="mt-3 rounded-lg border border-border bg-surface p-4 text-sm text-muted">
            ยังไม่มีสมาชิก เพิ่มคนแรกเป็นเจ้าของด้านล่าง
          </p>
        )}
      </div>

      <AddMemberForm orgId={org.id} slug={org.slug} orgName={org.name} />
    </div>
  )
}
