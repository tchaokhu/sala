// Adding a Document Template — its own page, like adding a Building. Saving
// lands back on the list.

import { requireMember } from '@/lib/supabase-server'
import { listTemplates } from '@/lib/document-templates'
import { BackLink } from '@/components/BackLink'
import { PageHeader } from '@/components/PageHeader'
import { UploadForm } from '../template-forms'

export default async function NewTemplatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const org = await requireMember(slug)
  // The existing titles, offered so a Word file can join its PDF.
  const { templates } = await listTemplates(org.id)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink href={`/o/${slug}/templates`}>Back to the Document Templates</BackLink>
        <PageHeader title="Add Template" summary="A blank contract or form, uploaded once and reused" />
      </div>
      <UploadForm slug={slug} titles={[...new Set(templates.map((t) => t.title))]} />
    </div>
  )
}
