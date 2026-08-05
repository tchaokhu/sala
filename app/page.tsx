import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { isSuperadmin } from '@/lib/superadmin'
import { SalaMark } from '@/components/SalaMark'

// The front door. Middleware has already sent a signed-out visitor to /login, so
// here there is a session: resolve which Org(s) it belongs to and route. One Org
// is the common case and skips straight in; several show a picker; none means an
// account that exists but was never given a Membership — a bootstrapping state an
// owner resolves in the SQL editor (ADR 0002).
export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('memberships')
    .select('org:orgs(slug, name)')
    .order('created_at', { ascending: true })

  const orgs = (data ?? [])
    .map((m) => m.org as unknown as { slug: string; name: string } | null)
    .filter((o): o is { slug: string; name: string } => o !== null)

  const operator = isSuperadmin(user.id)

  if (orgs.length === 1 && !operator) redirect(`/o/${orgs[0].slug}`)

  // An operator is not redirected past the picker even when they hold exactly
  // one Membership: the console is the other place they might be going, and a
  // redirect that skips it makes /admin reachable only by typing the path.
  //
  // An operator with no Membership at all is the ordinary case (Superadmin sits
  // outside every Org, CONTEXT.md) — for them this is the console's front door,
  // not an error state.

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-3">
          <SalaMark className="h-9 w-9 text-ink" />
          <span className="text-xl font-bold">Sala</span>
        </div>

        {orgs.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">Choose an Org</p>
            {orgs.map((o) => (
              <Link
                key={o.slug}
                href={`/o/${o.slug}`}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-accent"
              >
                <span className="font-semibold">{o.name}</span>
                <span className="font-mono text-xs text-muted">{o.slug}</span>
              </Link>
            ))}
          </div>
        )}

        {orgs.length === 0 && !operator && (
          <div className="rounded-lg border border-border bg-surface p-4 text-sm">
            <p className="font-semibold">No Org yet</p>
            <p className="mt-1 text-muted">
              This account has not been added to an Org. Ask a Superadmin for access.
            </p>
          </div>
        )}

        {operator && (
          <Link
            href="/admin"
            className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-accent"
          >
            <span className="font-semibold">Admin</span>
            <span className="text-xs text-muted">Manage Orgs and Members</span>
          </Link>
        )}
      </div>
    </main>
  )
}
