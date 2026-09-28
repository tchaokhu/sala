import { PageHeader } from '@/components/PageHeader'
import { RentalTableSkeleton } from '@/components/RentalTable'

export default function RentalsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rentals"
        summary={<span className="block h-4 w-24 animate-pulse rounded bg-border" aria-hidden />}
      />

      <div className="flex flex-wrap gap-2" aria-hidden>
        {['w-16', 'w-24', 'w-48', 'w-40', 'w-36', 'w-24', 'w-32'].map((w, i) => (
          <span key={i} className={`block h-8 animate-pulse rounded-full bg-border ${w}`} />
        ))}
      </div>

      <RentalTableSkeleton />
    </div>
  )
}
