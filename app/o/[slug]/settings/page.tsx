import { createClient, currentUser, requireMember } from '@/lib/supabase-server'
import { SettingsForms } from './settings-forms'

// A person's own account, inside one Org.
//
// Two things live here and nothing else: what this Org calls you, and the email
// you sign in with. Managing *other* people is an Admin's business (RLS) or the
// operator's (ADR 0006) — neither belongs on the page somebody opens to fix the
// spelling of their own name.
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // Both memoised per request by the layout's gate, so neither is a new trip.
  const org = await requireMember(slug)
  const user = await currentUser()

  const supabase = await createClient()
  // The caller's own Membership row. RLS admits Memberships in Orgs the caller
  // belongs to, and the layout has already established that this is one.
  const { data } = await supabase
    .from('memberships')
    .select('display_name, role')
    .eq('org_id', org.id)
    .eq('user_id', user?.id ?? '')
    .maybeSingle()

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">My account</h1>
        <p className="mt-1 text-sm text-muted">
          In {org.name} · {data?.role === 'admin' ? 'Admin' : 'Member'}
        </p>
      </div>

      <SettingsForms
        slug={slug}
        orgName={org.name}
        displayName={data?.display_name ?? null}
        email={user?.email ?? ''}
      />
    </div>
  )
}
