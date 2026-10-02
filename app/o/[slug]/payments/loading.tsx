import { PageHeader } from '@/components/PageHeader'
import { PaymentTableSkeleton } from '@/components/PaymentTable'
import { Bar } from '@/components/Skeleton'

export default function PaymentsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payments"
        summary={<Bar className="h-4 w-28" />}
      />

      <div className="flex flex-wrap gap-2" aria-hidden>
        {['w-40', 'w-44', 'w-28', 'w-40', 'w-12'].map((w, i) => (
          <Bar key={i} className={`h-8 rounded-full ${w}`} />
        ))}
      </div>

      <PaymentTableSkeleton />
    </div>
  )
}
