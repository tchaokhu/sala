import { SalaMark } from '@/components/SalaMark'

// Placeholder. Once Orgs and sign-in exist this redirects to the Org picker,
// or straight into the single Org a person belongs to.
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex items-center gap-3">
          <SalaMark className="h-10 w-10 text-ink" />
          <div className="flex flex-col leading-tight">
            <span className="text-2xl font-bold">Sala</span>
            <span className="font-mono text-xs text-muted">ศาลา</span>
          </div>
        </div>

        <p className="text-muted">
          หลังบ้านสำหรับเอเจนซี่เช่าอสังหาฯ หลายเจ้าในระบบเดียว
        </p>

        <div className="rounded-lg border border-border bg-surface p-4 text-sm">
          <p className="mb-2 font-semibold">ยังไม่เปิดใช้งาน</p>
          <p className="text-muted">
            ตอนนี้มีแค่โครงและตรรกะการเงินที่ยกมาจาก the-cozy-keys
            ยังไม่มีฐานข้อมูล ยังเข้าสู่ระบบไม่ได้
          </p>
        </div>
      </div>
    </main>
  )
}
