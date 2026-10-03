'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { flash } from '@/lib/flash'
import { createClient, currentUser, requireMember } from '@/lib/supabase-server'
import { cleanText } from '@/lib/validate'
import { documentExtension, documentFileName } from '@/lib/document-input'
import { DOCS_BUCKET, discardDocuments } from '@/lib/rental-documents'
import { parseTemplateForm, validateTemplateFiles } from '@/lib/template-input'
import { readTemplateTags } from '@/lib/docx-template'
import type { ActionResult } from '@/lib/action-result'

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// Uploading, editing and deleting Document Templates. The Rental Documents
// order (ADR 0007): Membership first and the Org from that gate (ADR 0002),
// bytes up on the caller's session, rows last; on delete the row first, then
// the object.

function failed(what: string, err: unknown): ActionResult {
  console.error(`[templates] ${what}:`, err)
  return { ok: false, message: `${what} failed. Try again, and tell your administrator if it keeps failing.` }
}

const INCOMPLETE: ActionResult = { ok: false, message: 'The request was incomplete. Try again.' }
const NOT_FOUND: ActionResult = {
  ok: false,
  message: 'This template was not found — it may already have been deleted. Reload the page.',
}

/** Fields: `slug`, `category`, `title`, `files` (one or more — a PDF and its
 *  Word source share a title). */
export async function uploadTemplates(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  if (!slug) return INCOMPLETE
  const org = await requireMember(slug)

  const parsed = parseTemplateForm(formData)
  if (!parsed.ok) return parsed
  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  const valid = validateTemplateFiles(files)
  if (!valid.ok) return valid

  // A broken tag is refused now, while the person is here to fix it, rather
  // than when someone tries to fill the template (ADR 0017).
  for (const file of files) {
    if (file.type !== DOCX) continue
    const read = readTemplateTags(new Uint8Array(await file.arrayBuffer()))
    if (!read.ok) return { ok: false, message: `${file.name}: ${read.message}` }
  }

  const [supabase, user] = await Promise.all([createClient(), currentUser()])
  const rows = files.map((file) => {
    const id = crypto.randomUUID()
    return {
      file,
      row: {
        id,
        org_id: org.id,
        category: parsed.values.category,
        title: parsed.values.title,
        storage_path: `${org.id}/templates/${id}.${documentExtension(file.type)}`,
        file_name: documentFileName(file.name, file.type),
        size_bytes: file.size,
        uploaded_by: user?.id ?? null,
      },
    }
  })
  const paths = rows.map((r) => r.row.storage_path)

  try {
    await Promise.all(
      rows.map(async ({ file, row }) => {
        const { error } = await supabase.storage
          .from(DOCS_BUCKET)
          .upload(row.storage_path, file, { contentType: file.type, upsert: false })
        if (error) throw error
      }),
    )
  } catch (err) {
    await discardDocuments(supabase, paths)
    return failed('Uploading the template', err)
  }

  const { error } = await supabase.from('document_templates').insert(rows.map((r) => r.row))
  if (error) {
    await discardDocuments(supabase, paths)
    return failed('Saving the template', error)
  }

  revalidatePath(`/o/${slug}/templates`)
  const n = rows.length
  // Outside any try: redirect() works by throwing.
  await flash(n === 1 ? 'Template uploaded' : `${n} files uploaded`, parsed.values.title)
  redirect(`/o/${slug}/templates`)
}

/** Fields: `slug`, `template_id`, `category`, `title`. */
export async function updateTemplate(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  const id = cleanText(formData.get('template_id'), 40)
  if (!slug || !id) return INCOMPLETE
  const org = await requireMember(slug)

  const parsed = parseTemplateForm(formData)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('document_templates')
    .update(parsed.values)
    .eq('id', id)
    .eq('org_id', org.id)
    .select('id')
    .maybeSingle()
  if (error) return failed('Saving the template', error)
  if (!data) return NOT_FOUND

  revalidatePath(`/o/${slug}/templates`)
  return { ok: true, message: 'Template saved', detail: parsed.values.title }
}

/** Fields: `slug`, `template_id`. */
export async function deleteTemplate(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  const id = cleanText(formData.get('template_id'), 40)
  if (!slug || !id) return INCOMPLETE
  const org = await requireMember(slug)

  const supabase = await createClient()
  // The path is read back off the deleted row, never off the form.
  const { data, error } = await supabase
    .from('document_templates')
    .delete()
    .eq('id', id)
    .eq('org_id', org.id)
    .select('storage_path, title')
    .maybeSingle()
  if (error) return failed('Deleting the template', error)
  if (!data) return NOT_FOUND

  const row = data as { storage_path: string; title: string }
  try {
    const { error: removeError } = await supabase.storage.from(DOCS_BUCKET).remove([row.storage_path])
    if (removeError) throw removeError
  } catch (err) {
    console.error(`[templates] template ${id} deleted, object not removed:`, err)
  }

  revalidatePath(`/o/${slug}/templates`)
  return { ok: true, message: 'Template deleted', detail: row.title }
}
