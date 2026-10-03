// Filling a Document Template (ADR 0017): pick what to fill from, check the
// values, download DOCX or PDF. The tags come from the file each time; Sala
// fills the ones it knows and the rest are typed in. Nothing here is saved.

import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/supabase-server'
import { todayBangkok } from '@/lib/dates'
import { readTemplateTags } from '@/lib/docx-template'
import { factsFromProperty, factsFromRental, getTemplateFile, listFillChoices } from '@/lib/template-source'
import { tagLabel, tagValues } from '@/lib/template-tags'
import { cleanText } from '@/lib/validate'
import { BackLink } from '@/components/BackLink'
import { PageHeader } from '@/components/PageHeader'
import { FillForm } from './fill-form'

export default async function FillTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>
  searchParams: Promise<{ rental?: string; property?: string }>
}) {
  const [{ slug, id }, query] = await Promise.all([params, searchParams])
  const org = await requireMember(slug)
  const rentalId = cleanText(query.rental, 40)
  const propertyId = cleanText(query.property, 40)

  const [template, { choices, capped }, facts] = await Promise.all([
    getTemplateFile(org.id, id),
    listFillChoices(org.id),
    rentalId ? factsFromRental(org.id, rentalId) : propertyId ? factsFromProperty(org.id, propertyId) : null,
  ])
  if (!template) notFound()

  const read = readTemplateTags(template.bytes)
  const tags = read.ok ? read.tags : []
  const values = tagValues(tags, { today: todayBangkok(), orgName: org.name, ...facts })
  const fields = tags.map((tag) => ({ tag, label: tagLabel(tag), value: values[tag] ?? '' }))
  const filled = fields.filter((f) => f.value).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink href={`/o/${slug}/templates`}>Back to the Document Templates</BackLink>
        <PageHeader
          title={template.title}
          summary={
            <span className="tabular">
              {tags.length} {tags.length === 1 ? 'tag' : 'tags'}, {filled} filled by Sala · {template.fileName}
            </span>
          }
        />
      </div>

      {!read.ok ? (
        <p className="text-sm text-warn">{read.message}</p>
      ) : (
        <FillForm
          // A new source is a new form: the inputs start from its values.
          key={`${rentalId}|${propertyId}`}
          slug={slug}
          templateId={template.id}
          fields={fields}
          choices={choices}
          capped={capped}
          chosenPropertyId={facts?.propertyId ?? null}
          rentalId={rentalId || null}
          pdfReady={Boolean(process.env.GOTENBERG_URL)}
        />
      )}
    </div>
  )
}
