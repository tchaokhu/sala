import Link from 'next/link'
import { listOrgs } from './data'

// The console's landing screen: every Org, and how many people are in it.
//
// The counts come from the same statement as the rows (admin_orgs), not from
// fetching Memberships and calling .length — the habit CLAUDE.md names, applied
// here even though the numbers are small today.
export default async function AdminHome() {
  const orgs = await listOrgs()
  const total = orgs[0]?.total ?? 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">เอเจนซี่</h1>
        <p className="mt-1 text-sm text-muted">
          ทั้งหมด {total} เอเจนซี่ · จัดการสมาชิกและสิทธิ์ได้จากที่นี่
        </p>
      </div>

      {orgs.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-4 text-sm">
          <p className="font-semibold">ยังไม่มีเอเจนซี่</p>
          <p className="mt-1 text-muted">
            สร้างเอเจนซี่แรกใน Supabase SQL editor แล้วกลับมาเพิ่มสมาชิกที่นี่
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {orgs.map((org) => (
            <li key={org.id}>
              <Link
                href={`/admin/orgs/${org.slug}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-accent"
              >
                <div className="flex flex-col leading-tight">
                  <span className="font-semibold">{org.name}</span>
                  <span className="font-mono text-xs text-muted">{org.slug}</span>
                </div>
                <div className="text-right text-sm text-muted">
                  <span className="tabular">{org.member_count}</span> สมาชิก
                  {/* An Org with no owner cannot manage itself — nobody inside
                      it can add or remove anyone. Worth seeing from the list. */}
                  {org.owner_count === 0 && (
                    <span className="ml-2 rounded-full border border-warn px-2 py-0.5 text-xs text-warn">
                      ไม่มีเจ้าของ
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {total > orgs.length && (
        <p className="text-sm text-muted">
          แสดง {orgs.length} จาก {total} — เพิ่มการแบ่งหน้าเมื่อรายการยาวกว่านี้
        </p>
      )}
    </div>
  )
}
