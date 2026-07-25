import Link from 'next/link'
import { SalaMark } from '@/components/SalaMark'

// Also the response for a member-less caller hitting /o/[slug] (ADR 0002): a
// non-member and a slug that does not exist look identical from here, so this
// page must not hint which it was.
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <SalaMark className="h-9 w-9 text-muted" />
        <div>
          <h1 className="text-lg font-semibold">ไม่พบหน้านี้</h1>
          <p className="mt-1 text-sm text-muted">
            หน้าที่คุณเปิดไม่มีอยู่ หรือคุณไม่มีสิทธิ์เข้าถึง
          </p>
        </div>
        <Link href="/" className="text-sm font-semibold text-accent hover:underline">
          กลับหน้าแรก
        </Link>
      </div>
    </main>
  )
}
