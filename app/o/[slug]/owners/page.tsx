// The Owners list — the people an Org's Properties belong to, one short row
// each, laid out like the Buildings list. Everything else about a person — the
// note, the Properties by name, editing — is on their own page.
//
// Search and cursor live in the URL, like the Buildings and Property lists, so
// the page is shareable and the back button works. The search matches the phone
// number as well as the name, because that is what an agent has in front of them
// when they go looking, and what tells two people with one name apart.

import Link from 'next/link'
import {
  ChevronRight,
  ChevronsLeft,
  Eye,
  Facebook,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { requireMember } from '@/lib/supabase-server'
import { listOwners, OWNERS_PAGE_SIZE } from '@/lib/owners'
import { PageHeader } from '@/components/PageHeader'
import { PagerLink } from '@/components/ListControls'
import { TableFrame } from '@/components/TableFrame'
import { HEAD_CELL, ROW_LINK, SEARCH_INPUT } from '@/components/styles'
import { DeleteOwnerForm } from './owner-forms'

export default async function OwnersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ q?: string; cursor?: string; deleted?: string }>
}) {
  const { slug } = await params
  const { q, cursor, deleted } = await searchParams

  const org = await requireMember(slug)
  const page = await listOwners(org.id, { search: q, cursor })

  const base = `/o/${slug}/owners`
  const search = (q ?? '').trim()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Owners"
        summary="The people who own the Properties on your books, and how to reach them"
        actions={
          <Link
            href={`${base}/new`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
          >
            <Plus size={16} aria-hidden />
            Add Owner
          </Link>
        }
      />

      {deleted && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted"
        >
          <Trash2 size={16} aria-hidden />
          Owner deleted. The Properties they owned are still here, with no Owner on file.
        </p>
      )}

      {/* A form, not a controlled input: the search term is a location. */}
      <form action={base} className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Search by name or phone"
            aria-label="Search Owners by name or phone"
            className={`${SEARCH_INPUT} w-full pl-9`}
          />
        </div>
        <button
          type="submit"
          className="rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:text-ink"
        >
          Search
        </button>
        {search && (
          <Link href={base} className="text-sm text-muted transition-colors hover:text-ink">
            Clear search
          </Link>
        )}
      </form>

      {page.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="font-semibold">{search ? 'No Owners found' : 'No Owners yet'}</p>
          <p className="mt-1 text-sm text-muted">
            {search ? (
              'Try another name or number, or clear the search'
            ) : (
              <>
                <Link href={`${base}/new`} className="text-accent underline-offset-4 hover:underline">
                  Add the first Owner
                </Link>
                , then pick them on a Property
              </>
            )}
          </p>
        </div>
      ) : (
        <TableFrame
          minWidth="min-w-[44rem]"
          head={
            <>
              <th scope="col" className={HEAD_CELL}>Owner</th>
              <th scope="col" className={HEAD_CELL}>Phone</th>
              <th scope="col" className={HEAD_CELL}>Contact</th>
              <th scope="col" className={`${HEAD_CELL} text-right`}>Properties</th>
              <th scope="col" className={`${HEAD_CELL} text-right`}>Manage</th>
            </>
          }
        >
          {page.rows.map((o) => (
            <tr
              key={o.id}
              className="h-14 border-b border-border transition-colors last:border-0 hover:bg-bg/60"
            >
              <td className="px-4 py-2">
                <Link href={`${base}/${o.id}`} className="font-medium underline-offset-4 hover:underline">
                  {o.name}
                </Link>
              </td>
              <td className="tabular whitespace-nowrap px-4 py-2 text-muted">{o.phone || '—'}</td>
              <td className="px-4 py-2 text-muted">
                {/* A word beside each icon, so "has LINE" reads without hovering. */}
                <span className="flex items-center gap-3">
                  {o.email && (
                    <span className="inline-flex items-center gap-1" title={o.email}>
                      <Mail size={14} aria-hidden />
                      Email
                    </span>
                  )}
                  {o.lineId && (
                    <span className="inline-flex items-center gap-1" title={o.lineId}>
                      <MessageCircle size={14} aria-hidden />
                      LINE
                    </span>
                  )}
                  {o.facebookUrl && (
                    <a
                      href={o.facebookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 transition-colors hover:text-ink"
                    >
                      <Facebook size={14} aria-hidden />
                      Facebook
                    </a>
                  )}
                  {!o.email && !o.lineId && !o.facebookUrl && '—'}
                </span>
              </td>
              <td className="tabular px-4 py-2 text-right font-medium">{o.propertyCount}</td>
              <td className="px-4 py-2 text-right">
                <div className="flex items-center justify-end gap-4">
                  <Link href={`${base}/${o.id}`} className={ROW_LINK}>
                    <Eye size={14} aria-hidden />
                    View
                  </Link>
                  <Link href={`${base}/${o.id}?edit=1`} className={ROW_LINK}>
                    <Pencil size={14} aria-hidden />
                    Edit
                  </Link>
                  <DeleteOwnerForm slug={slug} owner={o} compact />
                </div>
              </td>
            </tr>
          ))}
        </TableFrame>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>
          {page.rows.length > 0 && (
            <>
              Showing <span className="tabular font-semibold text-ink">{page.rows.length}</span>
            </>
          )}
        </span>
        <div className="flex items-center gap-2">
          <PagerLink
            href={search ? `${base}?q=${encodeURIComponent(search)}` : base}
            disabled={!cursor}
            icon={ChevronsLeft}
            label="First page"
          />
          <PagerLink
            href={`${base}?${new URLSearchParams({
              ...(search ? { q: search } : {}),
              cursor: page.nextCursor ?? '',
            })}`}
            disabled={!page.nextCursor}
            icon={ChevronRight}
            iconSide="right"
            label={`Next ${OWNERS_PAGE_SIZE}`}
          />
        </div>
      </div>
    </div>
  )
}
