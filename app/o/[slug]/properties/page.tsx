// The Property list.
//
// Summary above detail (CLAUDE.md): the counts come from one aggregate over the
// whole table, not from the twenty-five rows this page happens to hold. The
// list itself is bounded — a limit and a keyset cursor — because Properties
// only ever accumulate.
//
// The filter and the cursor live in the URL, so a page is shareable, the back
// button works, and none of it needs client-side state.

import Link from 'next/link'
import { Check, ChevronRight, ChevronsLeft, Plus, Trash2 } from 'lucide-react'
import { requireMember } from '@/lib/supabase-server'
import {
  getPropertyCounts,
  isPropertyStatus,
  listProperties,
  PAGE_SIZE,
  PROPERTY_STATUSES,
  type PropertyStatus,
} from '@/lib/properties'
import { PropertyTable } from '@/components/PropertyTable'
import { PageHeader } from '@/components/PageHeader'
import { FilterChip, PagerLink } from '@/components/ListControls'
import { STATUS_LABELS } from '@/components/StatusPill'

export default async function PropertiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{
    status?: string
    cursor?: string
    created?: string
    photos?: string
    deleted?: string
    posted?: string
  }>
}) {
  const { slug } = await params
  const { status: rawStatus, cursor, created, photos, deleted, posted } = await searchParams

  // Anything unrecognised in the query string is dropped rather than sent to
  // the database — the same reflex as never taking the Org from a request.
  const status: PropertyStatus | null = isPropertyStatus(rawStatus) ? rawStatus : null
  // A second, independent filter: rooms nobody is advertising. Exclusive with
  // the status chips rather than combined with them — two filters that can both
  // be half-on is a state nobody can read off the page.
  const postedNowhere = posted === 'nowhere'

  // The layout has already gated this route; requireMember is memoised per
  // request, so asking again for the Org's id costs nothing.
  const org = await requireMember(slug)

  // Independent of each other, so they go together rather than in sequence.
  const [counts, page] = await Promise.all([
    getPropertyCounts(org.id),
    listProperties(org.id, { status: postedNowhere ? null : status, cursor, postedNowhere }),
  ])

  const base = `/o/${slug}/properties`

  /** Every list link is built the same way, so the cursor can be appended
   *  without guessing whether a `?` is already there. */
  function link(opts: { status?: PropertyStatus | null; nowhere?: boolean; cursor?: string } = {}) {
    const q = new URLSearchParams()
    if (opts.status) q.set('status', opts.status)
    if (opts.nowhere) q.set('posted', 'nowhere')
    if (opts.cursor) q.set('cursor', opts.cursor)
    const qs = q.toString()
    return qs ? `${base}?${qs}` : base
  }
  const showing = counts.total === 0 ? 0 : page.rows.length
  // What the number on screen is a fraction of: the filtered count when a
  // filter is on, not the Org's whole holding.
  const matching = postedNowhere ? counts.postedNowhere : status ? counts[status] : counts.total
  // Both of these come from the query string, so neither is rendered back: the
  // id only decides whether the banner appears, and the count is read as a
  // number or ignored.
  const photoCount = /^\d{1,2}$/.test(photos ?? '') ? Number(photos) : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Properties"
        summary={
          <>
            <span className="tabular mx-1 font-semibold text-ink">{counts.total}</span> in total
          </>
        }
        actions={
          <Link
            href={`${base}/new`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
          >
            <Plus size={16} aria-hidden />
            Add Property
          </Link>
        }
      />

      {/* The action finished somewhere other than the screen it ran on, so the
          list is where it gets confirmed — and it says how many photos landed,
          because nothing on this page shows them yet. */}
      {created && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok"
        >
          <Check size={16} aria-hidden />
          Property added
          {photoCount !== null && photoCount > 0 && `, with ${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}`}
        </p>
      )}

      {/* Same reason: the edit page the delete ran on no longer exists, so this
          is the only screen left to say it happened. */}
      {deleted && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted"
        >
          <Trash2 size={16} aria-hidden />
          Property deleted
        </p>
      )}

      {/* Links, not buttons: the filter is a location. */}
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        <FilterChip
          href={link()}
          active={status === null && !postedNowhere}
          label="All"
          count={counts.total}
        />
        {PROPERTY_STATUSES.map((s) => (
          <FilterChip
            key={s}
            href={link({ status: s })}
            active={!postedNowhere && status === s}
            label={STATUS_LABELS[s]}
            count={counts[s]}
          />
        ))}
        {/* Not a status chip — it narrows Available to the rooms nobody is
            advertising (0013). It earns a chip of its own because it is the
            thing the page is scanned for, and warn because it is work waiting. */}
        <FilterChip
          href={link({ nowhere: true })}
          active={postedNowhere}
          label="Posted nowhere"
          count={counts.postedNowhere}
          tone="warn"
        />
      </nav>

      <PropertyTable rows={page.rows} slug={slug} newHref={`${base}/new`} />

      {/* Both controls are always drawn, disabled when there is nowhere to go:
          a pager that grows and shrinks moves the row above it. Keyset paging
          knows there is a next page but not which page this is, so the count
          says what is on screen rather than inventing a page number. */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>
          {showing > 0 ? (
            <>
              Showing <span className="tabular font-semibold text-ink">{showing}</span> of{' '}
              <span className="tabular font-semibold text-ink">{matching}</span>
            </>
          ) : (
            'Nothing to show'
          )}
        </span>
        <div className="flex items-center gap-2">
          <PagerLink
            href={link({ status, nowhere: postedNowhere })}
            disabled={!cursor}
            icon={ChevronsLeft}
            label="First page"
          />
          <PagerLink
            href={link({ status, nowhere: postedNowhere, cursor: page.nextCursor ?? undefined })}
            disabled={!page.nextCursor}
            icon={ChevronRight}
            iconSide="right"
            label={`Next ${PAGE_SIZE}`}
          />
        </div>
      </div>
    </div>
  )
}

