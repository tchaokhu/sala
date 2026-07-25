import { notFound, redirect } from 'next/navigation'
import {
  createClient,
  requireMember,
  NotAMemberError,
  NotAuthenticatedError,
} from '@/lib/supabase-server'
import { Shell } from '@/components/Shell'

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

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <Shell org={org} email={user?.email ?? null}>
      {children}
    </Shell>
  )
}
