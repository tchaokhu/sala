// Document Templates: the reads. Same bucket and rules as Rental Documents
// (lib/rental-documents.ts) — keys are `{org_id}/templates/{template_id}.{ext}`
// and the uploaded filename lives only in `file_name`.

import 'server-only'
import { createClient } from './supabase-server'
import type { TemplateCategory } from './template-input'

export interface DocumentTemplate {
  id: string
  category: TemplateCategory
  title: string
  fileName: string
  sizeBytes: number
  createdAt: string
  storagePath: string
}

export const TEMPLATES_LIMIT = 200

export async function listTemplates(orgId: string): Promise<{ templates: DocumentTemplate[]; capped: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('document_templates')
    .select('id, category, title, file_name, size_bytes, created_at, storage_path')
    .eq('org_id', orgId)
    .order('category')
    .order('title')
    .order('file_name')
    .limit(TEMPLATES_LIMIT + 1)
  if (error) throw error

  const rows = (data ?? []) as {
    id: string
    category: TemplateCategory
    title: string
    file_name: string
    size_bytes: number
    created_at: string
    storage_path: string
  }[]
  return {
    templates: rows.slice(0, TEMPLATES_LIMIT).map((r) => ({
      id: r.id,
      category: r.category,
      title: r.title,
      fileName: r.file_name,
      sizeBytes: Number(r.size_bytes),
      createdAt: r.created_at,
      storagePath: r.storage_path,
    })),
    capped: rows.length > TEMPLATES_LIMIT,
  }
}
