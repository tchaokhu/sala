import { PageHeader } from '@/components/PageHeader'
import { PaymentTableSkeleton } from '@/components/PaymentTable'

export default function PaymentsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payments"
        summary={<span className="block h-4 w-28 animate-pulse rounded bg-border" aria-hidden />}
      />

      <div className="flex flex-wrap gap-2" aria-hidden>
        {['w-40', 'w-44', 'w-28', 'w-40', 'w-12'].map((w, i) => (
          <span key={i} className={`block h-8 animate-pulse rounded-full bg-border ${w}`} />
        ))}
      </div>

      <PaymentTableSkeleton />
    </div>
  )
}
