// The Buildings page — the Buildings an Org keeps.
//
// This is where the name in the Property form's combobox comes from, and where
// the map link lives: one pin per Building rather than one per unit inside it
// (ADR 0008). The count beside each row is what a delete would strand, counted
// in Postgres.
//
// Search and cursor live in the URL, like the Property list, so the page is
// shareable and the back button works.

import Link from 'next/link'
import { ChevronRight, ChevronsLeft, MapPin, Search } from 'lucide-react'
import { requireMember } from '@/lib/supabase-server'
import { BUILDINGS_PAGE_SIZE, listBuildings } from '@/lib/buildings'
import { PageHeader } from '@/components/PageHeader'
import { MapPreview } from '@/components/MapPreview'
import { INPUT } from '@/components/form'
import { BuildingRowForms, CreateBuildingForm } from './building-forms'

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
      />

      <CreateBuildingForm slug={slug} />

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
            className={`${INPUT} w-full pl-9`}
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
            {search ? 'Try another word, or clear the search' : 'Add the first Building in the form above'}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {page.rows.map((building) => (
            <li
              key={building.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{building.name}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {building.nameEn && <span className="mr-2">{building.nameEn}</span>}
                    {[building.district, building.province].filter(Boolean).join(' · ') || 'No area set yet'}
                  </p>
                </div>
                <p className="tabular shrink-0 text-sm text-muted">
                  <span className="font-semibold text-ink">{building.propertyCount}</span>{' '}
                  {building.propertyCount === 1 ? 'Property' : 'Properties'}
                </p>
              </div>

              {building.googleMapUrl ? (
                <MapPreview url={building.googleMapUrl} title={`Map of ${building.name}`} />
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <MapPin size={16} aria-hidden />
                  No map link yet
                </p>
              )}

              <BuildingRowForms slug={slug} building={building} />
            </li>
          ))}
        </ul>
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
    'inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 whitespace-nowrap'
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
