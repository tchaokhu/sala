// One Owner in full: how to reach them, the note, and the Properties they own.
// `?edit=1` turns the same page into its editor, as a Building's page does.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  Check,
  Eye,
  Facebook,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
} from 'lucide-react'
import { requireMember } from '@/lib/supabase-server'
import { getOwner } from '@/lib/owners'
import { BUILDING_PROPERTIES_LIMIT, listOwnerProperties } from '@/lib/buildings'
import { formatBaht } from '@/lib/format'
import { BackLink } from '@/components/BackLink'
import { PageHeader } from '@/components/PageHeader'
import { StatusPill } from '@/components/StatusPill'
import { TableFrame } from '@/components/TableFrame'
import { HEAD_CELL, PANEL, ROW_LINK } from '@/components/styles'
import { DeleteOwnerForm, EditOwnerForm } from '../owner-forms'

export default async function OwnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  const { slug, id } = await params
  const { edit } = await searchParams
  const editing = edit === '1'

  const org = await requireMember(slug)
  // Both keyed by the id from the URL and read under the Org, so neither waits
  // on the other; a foreign id finds nothing in either.
  const [owner, properties] = await Promise.all([getOwner(org.id, id), listOwnerProperties(org.id, id)])
  if (!owner) notFound()

  const here = `/o/${slug}/owners/${id}`
  const contacts = [
    owner.phone && { icon: Phone, text: owner.phone, tabular: true },
    owner.email && { icon: Mail, text: owner.email, href: `mailto:${owner.email}` },
    owner.lineId && { icon: MessageCircle, text: `LINE: ${owner.lineId}` },
    owner.facebookUrl && { icon: Facebook, text: 'Facebook', href: owner.facebookUrl, external: true },
  ].filter(Boolean) as { icon: typeof Phone; text: string; href?: string; tabular?: boolean; external?: boolean }[]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink href={`/o/${slug}/owners`}>Back to the Owners list</BackLink>
        <PageHeader
          title={owner.name}
          summary={`${owner.propertyCount} ${owner.propertyCount === 1 ? 'Property' : 'Properties'}`}
          actions={
            <Link
              href={editing ? here : `${here}?edit=1`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
            >
              {editing ? <Check size={16} aria-hidden /> : <Pencil size={16} aria-hidden />}
              {editing ? 'Done' : 'Edit'}
            </Link>
          }
        />
      </div>

      {editing && (
        <>
          <EditOwnerForm slug={slug} owner={owner} />
          <section className={`flex flex-col gap-3 ${PANEL}`}>
            <div>
              <h2 className="font-semibold">Delete Owner</h2>
              <p className="mt-1 text-sm text-muted">Their Properties stay, with no Owner on file.</p>
            </div>
            <DeleteOwnerForm slug={slug} owner={owner} />
          </section>
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`flex flex-col gap-3 ${PANEL}`}>
          <h2 className="font-semibold">Contact</h2>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted">No contact on file.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {contacts.map(({ icon: Icon, text, href, tabular, external }) => (
                <li key={text} className={`flex items-center gap-2 ${tabular ? 'tabular' : ''}`}>
                  <Icon size={14} aria-hidden className="shrink-0 text-muted" />
                  {href ? (
                    <a
                      href={href}
                      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      className="truncate underline-offset-4 hover:underline"
                    >
                      {text}
                    </a>
                  ) : (
                    <span className="truncate">{text}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`flex flex-col gap-3 ${PANEL}`}>
          <h2 className="font-semibold">Note</h2>
          <p className="text-sm whitespace-pre-line text-muted">{owner.note || 'No note.'}</p>
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">
          Properties <span className="tabular text-muted">{owner.propertyCount}</span>
        </h2>
        {properties.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">
            No Properties name this Owner yet. Pick them as the Owner on a Property.
          </div>
        ) : (
          <TableFrame
            minWidth="min-w-[32rem]"
            head={
              <>
                <th scope="col" className={HEAD_CELL}>Property</th>
                <th scope="col" className={`${HEAD_CELL} text-right`}>Rent/month</th>
                <th scope="col" className={HEAD_CELL}>Status</th>
                <th scope="col" className={`${HEAD_CELL} text-right`}>Manage</th>
              </>
            }
          >
            {properties.rows.map((p) => (
              <tr key={p.id} className="h-12 border-b border-border last:border-0">
                <td className="px-4 py-2">
                  <span className="font-medium">{p.title}</span>
                  {(p.roomNumber || p.floor != null) && (
                    <span className="block text-xs text-muted">
                      {[p.roomNumber && `Room ${p.roomNumber}`, p.floor != null && `Floor ${p.floor}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </td>
                <td className="tabular whitespace-nowrap px-4 py-2 text-right">{formatBaht(p.priceMonthly)}</td>
                <td className="px-4 py-2">
                  <StatusPill status={p.status} />
                </td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/o/${slug}/properties/${p.id}`} className={ROW_LINK}>
                    <Eye size={14} aria-hidden />
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </TableFrame>
        )}
        {properties.capped && (
          <p className="text-xs text-muted">
            Showing the first {BUILDING_PROPERTIES_LIMIT}. The Properties list has all of them.
          </p>
        )}
      </section>
    </div>
  )
}
