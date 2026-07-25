// The Org landing. The counts a person comes for sit above any table (CLAUDE.md);
// the tiles are here now, their numbers arrive with the data layer. Money will be
// tabular-nums and right-aligned when it lands — the shape is reserved so nothing
// shifts when it does.

const TILES: { label: string; tone: 'plain' | 'ok' | 'warn' }[] = [
  { label: 'ทรัพย์ทั้งหมด', tone: 'plain' },
  { label: 'สัญญาที่ใช้งาน', tone: 'plain' },
  { label: 'ครบกำหนดเดือนนี้', tone: 'ok' },
  { label: 'ค้างชำระ', tone: 'warn' },
]

export default async function OrgHome({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await params

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">ภาพรวม</h1>
        <p className="mt-1 text-sm text-muted">สรุปสถานะก่อนลงรายละเอียด</p>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TILES.map(({ label, tone }) => (
          <div key={label} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm text-muted">{label}</p>
            <p
              className={
                'tabular mt-2 text-2xl font-bold ' +
                (tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : 'text-ink')
              }
            >
              —
            </p>
          </div>
        ))}
      </section>

      <div className="rounded-xl border border-dashed border-border bg-surface p-4 text-sm text-muted">
        ตัวเลขจะแสดงเมื่อเชื่อมชั้นข้อมูลแล้ว — ตอนนี้เป็นโครงหน้าเพื่อยืนยันสิทธิ์และเลย์เอาต์
      </div>
    </div>
  )
}
