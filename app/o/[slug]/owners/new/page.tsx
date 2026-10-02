// Adding an Owner — its own page, like adding a Building. Saving lands on the
// new Owner's page.

import { requireMember } from '@/lib/supabase-server'
import { BackLink } from '@/components/BackLink'
import { PageHeader } from '@/components/PageHeader'
import { CreateOwnerForm } from '../owner-forms'

export default async function NewOwnerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await requireMember(slug)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink href={`/o/${slug}/owners`}>Back to the Owners list</BackLink>
        <PageHeader
          title="Add Owner"
          summary="The person who owns a Property and entrusts it to you — only the name is needed"
        />
      </div>

      <CreateOwnerForm slug={slug} />
    </div>
  )
}
