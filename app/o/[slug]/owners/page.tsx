// The Owners page — the people an Org's Properties belong to.
//
// This is where the Property form's Owner picker gets its names, and the only
// place an Owner can be created: `owners.phone` is NOT NULL, so a name typed
// into that picker could never make a legal row.
//
// Search and cursor live in the URL, like the Buildings and Property lists, so
// the page is shareable and the back button works. The search matches the phone
// number as well as the name, because that is what an agent has in front of them
// when they go looking, and what tells two people with one name apart.

import Link from 'next/link'
import {
  ChevronRight,
  ChevronsLeft,
  Facebook,
  Mail,
  MessageCircle,
  Phone,
  Search,
} from 'lucide-react'
import { requireMember } from '@/lib/supabase-server'
import { listOwners, OWNERS_PAGE_SIZE } from '@/lib/owners'
import { PageHeader } from '@/components/PageHeader'
import { PANEL, SEARCH_INPUT } from '@/components/styles'
import { CreateOwnerForm } from './owner-forms'

export default async function OwnersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ q?: string; cursor?: string }>
}) {
  const { slug } = await params
  const { q, cursor } = await searchParams

  const org = await requireMember(slug)
  const page = await listOwners(org.id, { search: q, cursor })

  const base = `/o/${slug}/owners`
  const search = (q ?? '').trim()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Owners"
        summary="The people who own the Properties on your books, and how to reach them"
      />

      <CreateOwnerForm slug={slug} />

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
            {search ? 'Try another name or number, or clear the search' : 'Add the first Owner in the form above'}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {page.rows.map((owner) => (
            <li
              key={owner.id}
              className={`flex flex-col gap-3 ${PANEL}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{owner.name}</p>
                  <p className="tabular mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                    <Phone size={14} aria-hidden />
                    {owner.phone}
                  </p>
                </div>
                <p className="tabular shrink-0 text-sm text-muted">
                  <span className="font-semibold text-ink">{owner.propertyCount}</span>{' '}
                  {owner.propertyCount === 1 ? 'Property' : 'Properties'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
                {owner.email && (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Mail size={14} aria-hidden className="shrink-0" />
                    <span className="truncate">{owner.email}</span>
                  </span>
                )}
                {owner.lineId && (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <MessageCircle size={14} aria-hidden className="shrink-0" />
                    <span className="truncate">{owner.lineId}</span>
                  </span>
                )}
                {owner.facebookUrl && (
                  <a
                    href={owner.facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-1.5 transition-colors hover:text-ink"
                  >
                    <Facebook size={14} aria-hidden className="shrink-0" />
                    <span className="truncate underline-offset-4 hover:underline">Facebook</span>
                  </a>
                )}
                {!owner.email && !owner.lineId && !owner.facebookUrl && (
                  <span>No other contact on file</span>
                )}
              </div>

              {owner.note && (
                <p className="border-t border-border pt-3 text-sm whitespace-pre-line text-muted">
                  {owner.note}
                </p>
              )}
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
            label={`Next ${OWNERS_PAGE_SIZE}`}
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
