// The filled Document Template, as a download (ADR 0017). A Route Handler
// rather than a Server Action because it writes nothing and answers with a
// file; it is gated the same way — Membership from the session and the slug,
// the template under that Org — and the values posted are used for this one
// file and kept nowhere.
//
// The values carry a Tenant's ID number: no log line here includes them, or
// the template's text. Failures are logged by template id.

import { requireMember } from '@/lib/supabase-server'
import { cleanText } from '@/lib/validate'
import { fillTemplate, readTemplateTags } from '@/lib/docx-template'
import { getTemplateFile } from '@/lib/template-source'

const MAX_VALUE = 500
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function refuse(message: string, status: number) {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

/** Fields: `format` (`docx` or `pdf`) and `t.<tag>` per tag. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params
  const org = await requireMember(slug)
  const form = await request.formData()
  const format = form.get('format') === 'pdf' ? 'pdf' : 'docx'

  const gotenberg = process.env.GOTENBERG_URL
  if (format === 'pdf' && !gotenberg) {
    return refuse('PDF is not set up on this server yet. Download the Word file and save it as PDF from Word.', 503)
  }

  const template = await getTemplateFile(org.id, id).catch((err) => {
    console.error(`[templates] template ${id} could not be read:`, err)
    return undefined
  })
  if (template === undefined) return refuse('The template could not be read. Try again in a moment.', 502)
  if (template === null) return refuse('This template was not found, or is not a Word file. Reload the Templates page.', 404)

  // Only the tags the file has: anything else posted is ignored.
  const read = readTemplateTags(template.bytes)
  if (!read.ok) return refuse(read.message, 422)
  const values: Record<string, string> = {}
  for (const tag of read.tags) {
    const value = cleanText(form.get(`t.${tag}`), MAX_VALUE)
    if (value) values[tag] = value
  }

  let body: Uint8Array
  try {
    body = fillTemplate(template.bytes, values)
  } catch (err) {
    console.error(`[templates] template ${id} could not be filled:`, (err as Error).name)
    return refuse('The template could not be filled. Check its tags in Word and upload it again.', 422)
  }

  if (format === 'pdf') {
    const upload = new FormData()
    upload.append('files', new Blob([body as BlobPart], { type: DOCX }), 'document.docx')
    try {
      const res = await fetch(`${gotenberg}/forms/libreoffice/convert`, { method: 'POST', body: upload })
      if (!res.ok) throw new Error(`Gotenberg answered ${res.status}`)
      body = new Uint8Array(await res.arrayBuffer())
    } catch (err) {
      console.error(`[templates] template ${id} could not be converted to PDF:`, (err as Error).message)
      return refuse('The PDF could not be made — the converter is not answering. Download the Word file instead, or try again.', 502)
    }
  }

  // Named after the template and the room, never the Tenant.
  const name = [template.title, values.room_number].filter(Boolean).join(' ').replace(/[\\/:*?"<>|]/g, '-')
  const fileName = `${name}.${format}`
  return new Response(body as BodyInit, {
    headers: {
      'Content-Type': format === 'pdf' ? 'application/pdf' : DOCX,
      'Content-Disposition': `attachment; filename="document.${format}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'no-store',
    },
  })
}
