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
import { Check, ChevronRight, ChevronsLeft, Plus } from 'lucide-react'
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
import { STATUS_LABELS } from '@/components/StatusPill'

export default async function PropertiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ status?: string; cursor?: string; created?: string; photos?: string }>
}) {
  const { slug } = await params
  const { status: rawStatus, cursor, created, photos } = await searchParams

  // Anything unrecognised in the query string is dropped rather than sent to
  // the database — the same reflex as never taking the Org from a request.
  const status: PropertyStatus | null = isPropertyStatus(rawStatus) ? rawStatus : null

  // The layout has already gated this route; requireMember is memoised per
  // request, so asking again for the Org's id costs nothing.
  const org = await requireMember(slug)

  // Independent of each other, so they go together rather than in sequence.
  const [counts, page] = await Promise.all([
    getPropertyCounts(org.id),
    listProperties(org.id, { status, cursor }),
  ])

  const base = `/o/${slug}/properties`
  const href = (next: PropertyStatus | null) => (next ? `${base}?status=${next}` : base)
  const showing = counts.total === 0 ? 0 : page.rows.length
  // What the number on screen is a fraction of: the filtered count when a
  // filter is on, not the Org's whole holding.
  const matching = status ? counts[status] : counts.total
  // Both of these come from the query string, so neither is rendered back: the
  // id only decides whether the banner appears, and the count is read as a
  // number or ignored.
  const photoCount = /^\d{1,2}$/.test(photos ?? '') ? Number(photos) : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="ทรัพย์"
        summary={
          <>
            ทั้งหมด <span className="tabular mx-1 font-semibold text-ink">{counts.total}</span>{' '}
            รายการ
          </>
        }
        actions={
          <Link
            href={`${base}/new`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
          >
            <Plus size={16} aria-hidden />
            เพิ่มทรัพย์
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
          เพิ่มทรัพย์เรียบร้อยแล้ว
          {photoCount !== null && photoCount > 0 && ` พร้อมรูป ${photoCount} รูป`}
        </p>
      )}

      {/* Links, not buttons: the filter is a location. */}
      <nav aria-label="กรองตามสถานะ" className="flex flex-wrap gap-2">
        <FilterChip href={href(null)} active={status === null} label="ทั้งหมด" count={counts.total} />
        {PROPERTY_STATUSES.map((s) => (
          <FilterChip
            key={s}
            href={href(s)}
            active={status === s}
            label={STATUS_LABELS[s]}
            count={counts[s]}
          />
        ))}
      </nav>

      <PropertyTable rows={page.rows} newHref={`${base}/new`} />

      {/* Both controls are always drawn, disabled when there is nowhere to go:
          a pager that grows and shrinks moves the row above it. Keyset paging
          knows there is a next page but not which page this is, so the count
          says what is on screen rather than inventing a page number. */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>
          {showing > 0 ? (
            <>
              แสดง <span className="tabular font-semibold text-ink">{showing}</span> จาก{' '}
              <span className="tabular font-semibold text-ink">{matching}</span> รายการ
            </>
          ) : (
            'ไม่มีรายการ'
          )}
        </span>
        <div className="flex items-center gap-2">
          <PagerLink href={href(status)} disabled={!cursor} icon={ChevronsLeft} label="หน้าแรก" />
          <PagerLink
            href={`${href(status)}${status ? '&' : '?'}cursor=${page.nextCursor}`}
            disabled={!page.nextCursor}
            icon={ChevronRight}
            iconSide="right"
            label={`ถัดไป ${PAGE_SIZE} รายการ`}
          />
        </div>
      </div>
    </div>
  )
}

function PagerLink({
  href,
  disabled,
  icon: Icon,
  label,
  iconSide = 'left',
}: {
  href: string
  disabled: boolean
  icon: typeof ChevronRight
  label: string
  iconSide?: 'left' | 'right'
}) {
  const shape =
    'inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 whitespace-nowrap'
  const icon = <Icon size={16} aria-hidden />

  if (disabled) {
    return (
      <span aria-disabled className={`${shape} opacity-40`}>
        {iconSide === 'left' && icon}
        {label}
        {iconSide === 'right' && icon}
      </span>
    )
  }

  return (
    <Link href={href} className={`${shape} transition-colors hover:text-ink`}>
      {iconSide === 'left' && icon}
      {label}
      {iconSide === 'right' && icon}
    </Link>
  )
}

function FilterChip({
  href,
  active,
  label,
  count,
}: {
  href: string
  active: boolean
  label: string
  count: number
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={
        // A fixed height rather than padding, so the skeleton's chips are the
        // same size as the real ones and the row below them does not move.
        'inline-flex h-8 items-center gap-2 rounded-full border pr-2 pl-3 text-sm transition-colors ' +
        (active
          ? 'border-accent bg-accent text-on-accent'
          : 'border-border bg-surface text-muted hover:border-muted hover:text-ink')
      }
    >
      {label}
      <span
        className={
          'tabular rounded-full px-1.5 text-xs ' +
          // The badge has to stay visible when the chip itself takes the hover
          // background, so it is tinted off the border rather than off bg.
          (active ? 'bg-on-accent/20' : 'bg-border/50 text-muted')
        }
      >
        {count}
      </span>
    </Link>
  )
}
