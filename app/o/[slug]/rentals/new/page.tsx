import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireMember } from '@/lib/supabase-server'
import { todayBangkok } from '@/lib/dates'
import { getOrgTracksRent, listRentableProperties } from '@/lib/rentals'
import { listTenantOptions } from '@/lib/tenants'
import { PageHeader } from '@/components/PageHeader'
import { NewRentalForm } from './new-rental-form'

export default async function NewRentalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ property?: string }>
}) {
  const { slug } = await params
  const { property } = await searchParams
  const org = await requireMember(slug)

  const [properties, tenants, tracksRent] = await Promise.all([
    listRentableProperties(org.id),
    listTenantOptions(org.id),
    getOrgTracksRent(org.id),
  ])

  // Only preselected when it is one of this Org's rentable Properties — the id
  // in the URL decides nothing on its own.
  const initial = properties.options.find((p) => p.id === property) ?? null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`/o/${slug}/rentals`}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
        >
          <ChevronLeft size={16} aria-hidden />
          Back to the Rentals list
        </Link>
        <PageHeader
          title="Add Rental"
          summary="Pick the Property and the Tenant, set the term and the money — the Payments follow from them"
        />
      </div>

      <NewRentalForm
        slug={slug}
        today={todayBangkok()}
        tracksRent={tracksRent}
        properties={properties.options}
        propertiesCapped={properties.capped}
        initialProperty={initial}
        tenants={tenants.options}
        tenantsCapped={tenants.capped}
      />
    </div>
  )
}
