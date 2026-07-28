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
import { STATUS_LABELS } from '@/components/StatusPill'

export default async function PropertiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ status?: string; cursor?: string }>
}) {
  const { slug } = await params
  const { status: rawStatus, cursor } = await searchParams

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">ทรัพย์</h1>
        <p className="mt-1 text-sm text-muted">
          ทั้งหมด {counts.total} รายการ · ว่าง {counts.available} · จอง {counts.reserved} · มีผู้เช่า{' '}
          {counts.rented}
        </p>
      </div>

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

      <PropertyTable rows={page.rows} />

      <div className="flex items-center justify-between gap-4 text-sm text-muted">
        <span>
          {showing > 0 && `แสดง ${showing} รายการ`}
          {cursor && showing > 0 && ' (หน้าถัดไป)'}
        </span>
        <div className="flex gap-2">
          {cursor && (
            <Link
              href={href(status)}
              className="rounded-lg border border-border px-3 py-1.5 transition-colors hover:text-ink"
            >
              กลับหน้าแรก
            </Link>
          )}
          {page.nextCursor && (
            <Link
              href={`${href(status)}${status ? '&' : '?'}cursor=${page.nextCursor}`}
              className="rounded-lg border border-border px-3 py-1.5 transition-colors hover:text-ink"
            >
              ถัดไป {PAGE_SIZE} รายการ
            </Link>
          )}
        </div>
      </div>
    </div>
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
        'rounded-full border px-3 py-1 text-sm transition-colors ' +
        (active
          ? 'border-accent bg-accent text-on-accent'
          : 'border-border text-muted hover:text-ink')
      }
    >
      {label} <span className="tabular">{count}</span>
    </Link>
  )
}
