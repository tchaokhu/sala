// The Property list itself. A Server Component — nothing here is interactive,
// so none of it needs to reach the browser as JavaScript.
//
// Money is tabular and right-aligned, so a column of rents can be compared at a
// glance. The Rental behind an occupied Property is shown where it matters —
// who is in it and when that ends — because "มีผู้เช่า" on its own does not tell
// an agent whether this row needs work this month.

import { getRentalStatus } from '@/lib/rentals'
import { formatBaht, formatDateThai } from '@/lib/format'
import { StatusPill } from './StatusPill'
import type { PropertyListRow } from '@/lib/properties'

const TYPE_LABELS: Record<PropertyListRow['propertyType'], string> = {
  condo: 'คอนโด',
  house: 'บ้าน',
  townhome: 'ทาวน์โฮม',
}

/** How much runway the tenancy has, as words rather than a colour alone. */
function RentalEnd({ endDate }: { endDate: string }) {
  const { daysLeft, state } = getRentalStatus(endDate)
  const tone =
    state === 'expired' ? 'text-warn' : state === 'expiring' ? 'text-hold' : 'text-muted'
  const note =
    state === 'expired'
      ? `เกินกำหนด ${Math.abs(daysLeft ?? 0)} วัน`
      : state === 'expiring'
        ? `เหลือ ${daysLeft} วัน`
        : null

  return (
    <span className={`whitespace-nowrap text-xs ${tone}`}>
      ถึง {formatDateThai(endDate)}
      {note ? ` · ${note}` : ''}
    </span>
  )
}

export function PropertyTable({ rows }: { rows: PropertyListRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
        <p className="font-semibold">ไม่พบทรัพย์</p>
        <p className="mt-1 text-sm text-muted">
          ลองเปลี่ยนตัวกรองสถานะ หรือเพิ่มทรัพย์เข้าระบบ
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[46rem] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th scope="col" className="px-4 py-2.5 font-medium">ทรัพย์</th>
            <th scope="col" className="px-4 py-2.5 font-medium">ประเภท</th>
            <th scope="col" className="px-4 py-2.5 font-medium">ขนาด</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">ค่าเช่า/เดือน</th>
            <th scope="col" className="px-4 py-2.5 font-medium">สถานะ</th>
            <th scope="col" className="px-4 py-2.5 font-medium">ผู้เช่าปัจจุบัน</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3">
                <div className="font-medium">{row.title}</div>
                {row.roomNumber && (
                  <div className="text-xs text-muted">ห้อง {row.roomNumber}</div>
                )}
              </td>
              <td className="px-4 py-3 text-muted">{TYPE_LABELS[row.propertyType]}</td>
              <td className="tabular whitespace-nowrap px-4 py-3 text-muted">
                {row.bedrooms} นอน · {row.bathrooms} น้ำ · {row.areaSqm} ตร.ม.
              </td>
              <td className="tabular whitespace-nowrap px-4 py-3 text-right font-medium">
                {formatBaht(row.priceMonthly)}
              </td>
              <td className="px-4 py-3">
                <StatusPill status={row.status} />
              </td>
              <td className="px-4 py-3">
                {row.tenantName ? (
                  <div className="flex flex-col gap-0.5">
                    <span>{row.tenantName}</span>
                    {row.rentalEndDate && <RentalEnd endDate={row.rentalEndDate} />}
                  </div>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The same table's geometry with bars in it. Rows are a fixed height here and
 *  in the real thing, so the list does not jump when the data lands. */
export function PropertyTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-4 py-2.5">
        <span className="block h-4 w-24 animate-pulse rounded bg-border" aria-hidden />
      </div>
      <div aria-hidden>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0">
            <span className="block h-4 flex-1 animate-pulse rounded bg-border" />
            <span className="block h-4 w-16 animate-pulse rounded bg-border" />
            <span className="block h-4 w-20 animate-pulse rounded bg-border" />
            <span className="block h-5 w-16 animate-pulse rounded-full bg-border" />
          </div>
        ))}
      </div>
      <span className="sr-only">กำลังโหลดรายการทรัพย์</span>
    </div>
  )
}
