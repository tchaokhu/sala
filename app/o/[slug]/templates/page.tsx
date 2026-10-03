// Document Templates: the blank contracts and forms an Org keeps to reuse —
// upload, open, download, retitle, delete, and Fill on a Word file (ADR 0017).
// Arriving with ?rental= makes every Fill fill from that Rental.

import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireMember } from '@/lib/supabase-server'
import { cleanText } from '@/lib/validate'
import { PANEL } from '@/components/styles'
import { listTemplates } from '@/lib/document-templates'
import { signedDocumentUrls } from '@/lib/rental-documents'
import { PageHeader } from '@/components/PageHeader'
import { TemplateLibrary, type ShownTemplate } from './template-forms'

const bangkokDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' })

export default async function TemplatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ rental?: string }>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const rentalId = cleanText(query.rental, 40) || null
  const org = await requireMember(slug)
  const { templates, capped } = await listTemplates(org.id)
  const urls = await signedDocumentUrls(templates)

  // storagePath stays on the server.
  const shown: ShownTemplate[] = templates.map((t) => ({
    id: t.id,
    category: t.category,
    title: t.title,
    fileName: t.fileName,
    sizeBytes: t.sizeBytes,
    addedOn: bangkokDate.format(new Date(t.createdAt)),
    url: urls[t.storagePath]?.url ?? null,
    downloadUrl: urls[t.storagePath]?.downloadUrl ?? null,
  }))
  const titles = new Set(templates.map((t) => t.title)).size

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Document Templates"
        summary={
          <span className="tabular">
            {titles} {titles === 1 ? 'template' : 'templates'}, {templates.length}{' '}
            {templates.length === 1 ? 'file' : 'files'}
          </span>
        }
        actions={
          <Link
            href={`/o/${slug}/templates/new`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
          >
            <Plus size={16} aria-hidden />
            Add Template
          </Link>
        }
      />
      {rentalId && (
        <p className={`text-sm ${PANEL}`}>
          Choose a Word template and press <span className="font-semibold">Fill</span> — it fills from the
          Rental you came from.
        </p>
      )}
      <TemplateLibrary slug={slug} templates={shown} rentalId={rentalId} />
      {capped && (
        <p className="text-xs text-warn">
          Showing the first {templates.length} files — there are more. Delete the ones nobody uses.
        </p>
      )}
    </div>
  )
}
