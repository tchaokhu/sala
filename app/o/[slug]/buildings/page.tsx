// จัดการโครงการ — the Buildings an Org keeps.
//
// This is where the name in the Property form's combobox comes from, and where
// the map link lives: one pin per โครงการ rather than one per unit inside it
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
        title="โครงการ"
        summary="ชื่อที่ใช้ตั้งชื่อทรัพย์ และแผนที่ที่ทรัพย์ในโครงการนี้ใช้ร่วมกัน"
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
            placeholder="ค้นหาชื่อโครงการ"
            aria-label="ค้นหาชื่อโครงการ"
            className={`${INPUT} w-full pl-9`}
          />
        </div>
        <button
          type="submit"
          className="rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:text-ink"
        >
          ค้นหา
        </button>
        {search && (
          <Link href={base} className="text-sm text-muted transition-colors hover:text-ink">
            ล้างคำค้น
          </Link>
        )}
      </form>

      {page.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="font-semibold">{search ? 'ไม่พบโครงการที่ค้นหา' : 'ยังไม่มีโครงการ'}</p>
          <p className="mt-1 text-sm text-muted">
            {search ? 'ลองคำอื่น หรือล้างคำค้น' : 'เพิ่มโครงการแรกจากช่องด้านบน'}
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
                    {[building.district, building.province].filter(Boolean).join(' · ') || 'ยังไม่ได้ระบุพื้นที่'}
                  </p>
                </div>
                <p className="tabular shrink-0 text-sm text-muted">
                  ทรัพย์ <span className="font-semibold text-ink">{building.propertyCount}</span> รายการ
                </p>
              </div>

              {building.googleMapUrl ? (
                <MapPreview url={building.googleMapUrl} title={`แผนที่ ${building.name}`} />
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <MapPin size={16} aria-hidden />
                  ยังไม่มีลิงก์แผนที่
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
              แสดง <span className="tabular font-semibold text-ink">{page.rows.length}</span> รายการ
            </>
          )}
        </span>
        <div className="flex items-center gap-2">
          <PagerLink
            href={search ? `${base}?q=${encodeURIComponent(search)}` : base}
            disabled={!cursor}
            icon={ChevronsLeft}
            label="หน้าแรก"
          />
          <PagerLink
            href={`${base}?${new URLSearchParams({
              ...(search ? { q: search } : {}),
              cursor: page.nextCursor ?? '',
            })}`}
            disabled={!page.nextCursor}
            icon={ChevronRight}
            iconSide="right"
            label={`ถัดไป ${BUILDINGS_PAGE_SIZE} รายการ`}
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
