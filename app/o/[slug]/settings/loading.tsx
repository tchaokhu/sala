// My account's shape while the Membership row loads: the heading, then the
// Display name and Sign-in email boxes.

import { Bar } from '@/components/Skeleton'

export default function SettingsLoading() {
  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">My account</h1>
        <Bar className="mt-1 h-5 w-40" />
      </div>

      {['Display name', 'Sign-in email'].map((title) => (
        <div key={title} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <h2 className="font-semibold">{title}</h2>
          <div className="flex flex-col gap-2 py-0.5" aria-hidden>
            <Bar className="h-3.5 w-full" />
            <Bar className="h-3.5 w-1/2" />
          </div>
          <div className="flex gap-2" aria-hidden>
            <Bar className="h-9 flex-1 rounded-lg" />
            <Bar className="h-9 w-24 rounded-lg" />
          </div>
        </div>
      ))}

      <span className="sr-only">Loading your account</span>
    </div>
  )
}
