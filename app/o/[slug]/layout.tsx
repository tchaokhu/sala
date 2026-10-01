import { notFound, redirect } from 'next/navigation'
import {
  currentUser,
  requireMember,
  NotAMemberError,
  NotAuthenticatedError,
} from '@/lib/supabase-server'
import { Shell } from '@/components/Shell'
import { isSuperadmin } from '@/lib/superadmin'

// The gate on every Org page. requireMember resolves the Org from the session
// plus the slug and refuses a caller who holds no Membership — the two refusals
// map to different responses: a signed-out visitor goes to /login, a signed-in
// one who is not a member gets a 404, which reveals nothing about whether the
// Org exists (ADR 0002). Because it is the layout, no child page renders until
// this has passed.
export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  let org
  try {
    org = await requireMember(slug)
  } catch (err) {
    if (err instanceof NotAuthenticatedError) redirect(`/login?next=/o/${slug}`)
    if (err instanceof NotAMemberError) notFound()
    throw err
  }

  // Free: requireMember has already resolved the user this request, and
  // currentUser is memoised per render, and reads the verified token rather
  // than asking the auth server (ADR 0015).
  const user = await currentUser()

  return (
    <Shell
      org={org}
      email={user?.email ?? null}
      // Draws the link to the console. The console gates itself; this only
      // saves an operator from typing the path.
      isSuperadmin={isSuperadmin(user?.id)}
    >
      {children}
    </Shell>
  )
}
