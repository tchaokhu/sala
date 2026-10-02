import { PageHeader } from '@/components/PageHeader'
import { RentalTableSkeleton } from '@/components/RentalTable'
import { Bar } from '@/components/Skeleton'

export default function RentalsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rentals"
        summary={<Bar className="h-4 w-24" />}
      />

      <div className="flex flex-wrap gap-2" aria-hidden>
        {['w-16', 'w-24', 'w-48', 'w-40', 'w-36', 'w-24', 'w-32'].map((w, i) => (
          <Bar key={i} className={`h-8 rounded-full ${w}`} />
        ))}
      </div>

      <RentalTableSkeleton />
    </div>
  )
}
