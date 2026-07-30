'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import { SalaMark } from './SalaMark'
import { ThemeToggle } from './ThemeToggle'

// The chrome every Org page sits inside. Thai labels are the user's vocabulary;
// `ทรัพย์` is Property, kept consistent with CONTEXT.md and never given a second
// Thai word. Nothing here fetches — the Org is resolved once in the layout and
// handed down.
const NAV: { label: string; sub: string }[] = [
  { label: 'ภาพรวม', sub: '' },
  { label: 'ทรัพย์', sub: '/properties' },
  { label: 'สัญญาเช่า', sub: '/rentals' },
  { label: 'การเงิน', sub: '/payments' },
  { label: 'คำถามเข้า', sub: '/inquiries' },
]

export function Shell({
  org,
  email,
  isSuperadmin = false,
  children,
}: {
  org: { slug: string; name: string }
  email: string | null
  /** Decided on the server (ADR 0006). This only chooses whether a link is
   *  drawn — /admin gates itself, and hiding the link protects nothing. */
  isSuperadmin?: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const base = `/o/${org.slug}`

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href={base} className="flex items-center gap-2.5">
            <SalaMark className="h-7 w-7 text-ink" />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold">{org.name}</span>
              <span className="font-mono text-[11px] text-muted">{org.slug}</span>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            {isSuperadmin && (
              <Link
                href="/admin"
                className="hidden rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink sm:inline-block"
              >
                ผู้ดูแลระบบ
              </Link>
            )}
            <Link
              href={`${base}/settings`}
              className="text-xs text-muted transition-colors hover:text-ink"
            >
              {email ?? 'บัญชีของฉัน'}
            </Link>
            <ThemeToggle />
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink"
              >
                ออกจากระบบ
              </button>
            </form>
          </div>
        </div>

        <nav className="mx-auto w-full max-w-6xl px-4">
          <ul className="flex gap-1 overflow-x-auto">
            {NAV.map(({ label, sub }) => {
              const href = base + sub
              const active = sub === '' ? pathname === base : pathname.startsWith(href)
              return (
                <li key={label}>
                  <Link
                    href={href}
                    className={clsx(
                      'inline-block whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
                      active
                        ? 'border-accent font-semibold text-ink'
                        : 'border-transparent text-muted hover:text-ink',
                    )}
                  >
                    {label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  )
}
