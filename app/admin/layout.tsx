import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { SalaMark } from '@/components/SalaMark'
import { ThemeToggle } from '@/components/ThemeToggle'
import { NotAuthenticatedError, NotSuperadminError, requireSuperadmin } from './guard'

// The gate on the console. A signed-out visitor goes to sign in; a signed-in one
// who is not an operator gets a 404, which reveals nothing about whether /admin
// exists — the same non-disclosure NotAMemberError uses on Org pages.
//
// Deliberately not the Org Shell. This is a different context with different
// powers, and a header that looked like an agency's would invite the mistake of
// reading one screen as the other.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let user
  try {
    user = await requireSuperadmin()
  } catch (err) {
    if (err instanceof NotAuthenticatedError) redirect('/login?next=/admin')
    if (err instanceof NotSuperadminError) notFound()
    throw err
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2.5">
            <SalaMark className="h-7 w-7 text-ink" />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold">Superadmin</span>
              <span className="font-mono text-[11px] text-muted">Sala</span>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted sm:inline">{user.email}</span>
            <ThemeToggle />
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
    </div>
  )
}
