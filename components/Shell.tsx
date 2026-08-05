'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import {
  Building2,
  Inbox,
  Landmark,
  LayoutGrid,
  LogOut,
  Menu,
  ScrollText,
  ShieldCheck,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { SalaMark } from './SalaMark'
import { ThemeToggle } from './ThemeToggle'

// The chrome every Org page sits inside: a fixed sidebar of destinations, a
// slim bar for the account, and the page itself in the remaining column. The
// whole thing is one card floating on the stone ground, which is what keeps the
// eye inside the working area on a wide monitor.
//
// The labels are CONTEXT.md's own vocabulary — one word per term, never a second
// word for something that already has one. Nothing here fetches — the Org is
// resolved once in the layout and handed down.
const NAV: { label: string; sub: string; icon: LucideIcon }[] = [
  { label: 'Overview', sub: '', icon: LayoutGrid },
  { label: 'Properties', sub: '/properties', icon: Building2 },
  { label: 'Buildings', sub: '/buildings', icon: Landmark },
  { label: 'Rentals', sub: '/rentals', icon: ScrollText },
  { label: 'Payments', sub: '/payments', icon: Wallet },
  { label: 'Inquiries', sub: '/inquiries', icon: Inbox },
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

  // Below lg the sidebar becomes a drawer. What is stored is the path it was
  // opened on, not a boolean: navigating changes the path, so following a link
  // inside the drawer closes it during the next render rather than in an effect
  // that fires afterwards. Escape is the other way out — otherwise the drawer
  // traps the small screen it opened on.
  const [openedOn, setOpenedOn] = useState<string | null>(null)
  const drawerOpen = openedOn === pathname
  const setDrawerOpen = (open: boolean) => setOpenedOn(open ? pathname : null)

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      // setOpenedOn rather than the helper below: the state setter is stable,
      // so the listener is attached once per open instead of on every render.
      if (e.key === 'Escape') setOpenedOn(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  return (
    <div className="flex min-h-full flex-1 flex-col p-0 sm:p-3 lg:p-4">
      {/* The chrome is surface, the working area is the stone ground: every
          panel in the product — a tile, a form, the table — is a surface card
          drawn on that ground, and nesting surface inside surface would flatten
          all of them at once. */}
      <div className="flex min-h-full flex-1 overflow-hidden border-border bg-bg shadow-card sm:rounded-2xl sm:border">
        <Sidebar
          org={org}
          base={base}
          pathname={pathname}
          isSuperadmin={isSuperadmin}
          className="hidden w-60 shrink-0 border-r border-border bg-surface lg:flex"
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border px-4 lg:px-8">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                aria-expanded={drawerOpen}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted transition-colors hover:text-ink lg:hidden"
              >
                <Menu size={18} aria-hidden />
              </button>
              {/* The Org's identity lives in the sidebar on a wide screen; this
                  is the same thing for the width where the sidebar is away. */}
              <Link href={base} className="flex min-w-0 items-center gap-2 lg:hidden">
                <SalaMark className="h-6 w-6 shrink-0 text-ink" />
                <span className="truncate text-sm font-bold">{org.name}</span>
              </Link>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle />
              <Link
                href={`${base}/settings`}
                className="flex items-center gap-2 rounded-full border border-border py-1 pr-3 pl-1 transition-colors hover:border-muted"
              >
                <span
                  aria-hidden
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-bold text-accent"
                >
                  {initialOf(email)}
                </span>
                <span className="hidden max-w-56 truncate text-xs text-muted sm:block">
                  {email ?? 'My account'}
                </span>
              </Link>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-surface"
          >
            <Sidebar
              org={org}
              base={base}
              pathname={pathname}
              isSuperadmin={isSuperadmin}
              className="flex-1"
              onClose={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/** The destinations, the mark, and the way out. One component so the drawer and
 *  the wide-screen sidebar cannot drift apart. */
function Sidebar({
  org,
  base,
  pathname,
  isSuperadmin,
  className,
  onClose,
}: {
  org: { slug: string; name: string }
  base: string
  pathname: string
  isSuperadmin: boolean
  className?: string
  /** Present only in the drawer, where the panel needs its own way out. */
  onClose?: () => void
}) {
  return (
    <div className={clsx('flex flex-col', className)}>
      <div className="flex items-center gap-2 px-4 py-4">
        <Link href={base} className="flex min-w-0 items-center gap-2.5">
          <SalaMark className="h-8 w-8 shrink-0 text-ink" />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-bold">{org.name}</span>
            <span className="truncate font-mono text-[11px] text-muted">{org.slug}</span>
          </span>
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-bg hover:text-ink"
          >
            <X size={18} aria-hidden />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <SectionLabel>Main menu</SectionLabel>
        <ul className="mt-1 flex flex-col gap-0.5">
          {NAV.map(({ label, sub, icon }) => {
            const href = base + sub
            return (
              <li key={label}>
                <NavRow
                  href={href}
                  icon={icon}
                  label={label}
                  active={sub === '' ? pathname === base : pathname.startsWith(href)}
                />
              </li>
            )
          })}
        </ul>

        {isSuperadmin && (
          <>
            <SectionLabel className="mt-6">System</SectionLabel>
            <ul className="mt-1">
              <li>
                <NavRow
                  href="/admin"
                  icon={ShieldCheck}
                  label="Admin"
                  active={pathname.startsWith('/admin')}
                />
              </li>
            </ul>
          </>
        )}
      </nav>

      <div className="border-t border-border p-3">
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-bg hover:text-ink"
          >
            <LogOut size={18} className="shrink-0" aria-hidden />
            Log out
          </button>
        </form>
      </div>
    </div>
  )
}

function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p className={clsx('px-3 text-[11px] font-semibold tracking-wide text-muted', className)}>
      {children}
    </p>
  )
}

function NavRow({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string
  icon: LucideIcon
  label: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
        // The accent marks where you are, which is navigation and not status —
        // the two never share a colour (CLAUDE.md).
        active
          ? 'bg-accent font-semibold text-on-accent'
          : 'text-muted hover:bg-bg hover:text-ink',
      )}
    >
      <Icon size={18} className="shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  )
}

/** The account chip's avatar. A letter, not a photograph: Sala has no avatars,
 *  and an empty circle in every corner reads as something failing to load. */
function initialOf(email: string | null): string {
  const first = email?.trim().charAt(0)
  return first ? first.toUpperCase() : '?'
}
