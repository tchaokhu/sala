// The Buildings list — the Buildings an Org keeps, one short row each.
//
// A row is what a person scans for: the name, the area, how many Properties sit
// in it, whether it has a map. Everything else — the map itself, facilities,
// the Properties by name, editing — is on the Building's own page, so twenty
// Buildings read as a list rather than twenty maps (ADR 0008 for why the map is
// the Building's and not the unit's).
//
// Search and cursor live in the URL, like the Property list, so the page is
// shareable and the back button works.

import Link from 'next/link'
import {
  ChevronRight,
  ChevronsLeft,
  Eye,
  MapPin,
  Pencil,
  Plus,
  Search,
} from 'lucide-react'
import { requireMember } from '@/lib/supabase-server'
import { BUILDINGS_PAGE_SIZE, listBuildings } from '@/lib/buildings'
import { PageHeader } from '@/components/PageHeader'
import { PagerLink } from '@/components/ListControls'
import { HEAD_CELL, ROW_LINK, SEARCH_INPUT } from '@/components/styles'
import { DeleteBuildingForm } from './building-forms'
import { TableFrame } from '@/components/TableFrame'

export default async function BuildingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ q?: string; cursor?: string }>
}) {
  const { slug } = await params
  const { q, cursor } = await searchParams

  const org = await requireMember(slug)
  const page = await listBuildings(org.id, { search: q, cursor })

  const base = `/o/${slug}/buildings`
  const search = (q ?? '').trim()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Buildings"
        summary="The names Properties are named after, and the map every Property in a Building shares"
        actions={
          <Link
            href={`${base}/new`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
          >
            <Plus size={16} aria-hidden />
            Add Building
          </Link>
        }
      />

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
            placeholder="Search Building names"
            aria-label="Search Building names"
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
          <p className="font-semibold">{search ? 'No Buildings found' : 'No Buildings yet'}</p>
          <p className="mt-1 text-sm text-muted">
            {search ? (
              'Try another word, or clear the search'
            ) : (
              <>
                <Link href={`${base}/new`} className="text-accent underline-offset-4 hover:underline">
                  Add the first Building
                </Link>
                , then name Properties after it
              </>
            )}
          </p>
        </div>
      ) : (
        <TableFrame
          minWidth="min-w-[40rem]"
          head={
            <>
              <th scope="col" className={HEAD_CELL}>Building</th>
              <th scope="col" className={HEAD_CELL}>Area</th>
              <th scope="col" className={`${HEAD_CELL} text-right`}>Properties</th>
              <th scope="col" className={HEAD_CELL}>Map</th>
              <th scope="col" className={`${HEAD_CELL} text-right`}>Manage</th>
            </>
          }
        >
          {page.rows.map((b) => (
            <tr
              key={b.id}
              className="h-14 border-b border-border transition-colors last:border-0 hover:bg-bg/60"
            >
              <td className="px-4 py-2">
                <Link href={`${base}/${b.id}`} className="font-medium underline-offset-4 hover:underline">
                  {b.name}
                </Link>
                {b.nameEn && <span className="block text-xs text-muted">{b.nameEn}</span>}
              </td>
              <td className="px-4 py-2 text-muted">
                {[b.district, b.province].filter(Boolean).join(' · ') || '—'}
              </td>
              <td className="tabular px-4 py-2 text-right font-medium">{b.propertyCount}</td>
              <td className="px-4 py-2 text-muted">
                {b.googleMapUrl ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={14} aria-hidden />
                    Pinned
                  </span>
                ) : (
                  'No map yet'
                )}
              </td>
              <td className="px-4 py-2 text-right">
                <div className="flex items-center justify-end gap-4">
                  <Link href={`${base}/${b.id}`} className={ROW_LINK}>
                    <Eye size={14} aria-hidden />
                    View
                  </Link>
                  <Link href={`${base}/${b.id}?edit=1`} className={ROW_LINK}>
                    <Pencil size={14} aria-hidden />
                    Edit
                  </Link>
                  <DeleteBuildingForm slug={slug} building={b} compact />
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
            label={`Next ${BUILDINGS_PAGE_SIZE}`}
          />
        </div>
      </div>
    </div>
  )
}
