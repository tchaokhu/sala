'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, requireMember } from '@/lib/supabase-server'
import { cleanText } from '@/lib/validate'
import {
  composePropertyTitle,
  imageExtension,
  parseBuildingChoice,
  parsePropertyForm,
  validateImages,
  type NewProperty,
} from '@/lib/property-input'
import { buildingName } from '@/lib/buildings'
import type { ActionResult } from '@/lib/action-result'

// Creating a Property. The first write in the product that moves bytes as well
// as rows — see docs/adr/0007-property-photos-upload-through-the-server-action.md.
//
// ADR 0002 in three lines: this is a Server Action, it begins by establishing
// Membership, and the Org it writes into comes from that gate rather than from
// anything the form sent. The `slug` field names which Org to *resolve*; a
// caller holding no Membership there is refused before a single byte is stored.
// RLS is the second check, not the only one.

const BUCKET = 'sala-images'

/** Errors say what to do next and never carry raw Postgres or Storage text
 *  (CLAUDE.md). The detail goes to the server log, where an operator can read
 *  it. Nothing from the form is logged — a Property's title is not sensitive,
 *  but making the log a copy of user input is the habit that later leaks a
 *  Tenant's id_card. */
function failed(what: string, err: unknown): ActionResult {
  console.error(`[properties] ${what}:`, err)
  return { ok: false, message: `${what}ไม่สำเร็จ ลองใหม่อีกครั้ง หากยังไม่ได้ให้แจ้งผู้ดูแลระบบ` }
}

export async function createProperty(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  if (!slug) return { ok: false, message: 'ไม่พบเอเจนซี่' }

  // Before anything else, and before any file moves.
  const org = await requireMember(slug)

  const parsed = parsePropertyForm(formData)
  if (!parsed.ok) return parsed

  const choice = parseBuildingChoice(formData)
  if (!choice.ok) return choice

  const files = formData
    .getAll('images')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0)
  const images = validateImages(files)
  if (!images.ok) return images

  // Minted here so the storage path is known before the row is. The alternative
  // — insert, then upload — leaves a Property carrying paths to bytes that never
  // arrived, and CLAUDE.md is explicit that a failed upload fails.
  const id = crypto.randomUUID()
  const supabase = await createClient()

  // Before any byte moves, because this is the step that can still refuse.
  let building: { id: string; name: string }
  try {
    building = await resolveBuilding(org.id, choice.values)
  } catch (err) {
    if (err instanceof UnknownBuildingError) {
      return { ok: false, message: 'ไม่พบโครงการที่เลือก เลือกใหม่อีกครั้ง' }
    }
    return failed('การเพิ่มโครงการ', err)
  }

  let paths: string[]
  try {
    // One Promise.all, not a loop of awaits: the uploads do not depend on each
    // other and five photos should not cost five round-trips in series.
    paths = await Promise.all(
      files.map(async (file, index) => {
        // Validated above; the assertion is only for the type.
        const ext = imageExtension(file.type) as string
        const path = `${org.id}/${id}/${index}.${ext}`
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false })
        if (error) throw error
        return path
      }),
    )
  } catch (err) {
    // Promise.all rejects on the first failure while the others may still land,
    // so the sweep names the whole intended prefix rather than what resolved.
    await discard(supabase, files.map((f, i) => `${org.id}/${id}/${i}.${imageExtension(f.type)}`))
    return failed('การอัปโหลดรูป', err)
  }

  const row: NewProperty & {
    id: string
    org_id: string
    building_id: string
    title: string
    images: string[]
  } = {
    id,
    org_id: org.id,
    building_id: building.id,
    // From the Building's stored name, never from the form (ADR 0008).
    title: composePropertyTitle(building.name, parsed.values.room_number),
    ...parsed.values,
    images: paths,
  }

  const { error } = await supabase.from('properties').insert(row)
  if (error) {
    await discard(supabase, paths)
    return failed('การเพิ่มทรัพย์', error)
  }

  revalidatePath(`/o/${slug}/properties`)
  revalidatePath(`/o/${slug}`)
  // Throws NEXT_REDIRECT, so it goes after everything that can fail and outside
  // any try — a catch here would swallow the navigation.
  redirect(`/o/${slug}/properties?created=${id}&photos=${paths.length}`)
}

class UnknownBuildingError extends Error {}

/**
 * The Building this Property belongs to, creating it when the combobox carried
 * a name nobody has entered yet.
 *
 * The id path re-reads the name from the database instead of taking the text
 * beside it: the two fields are posted together and only one of them is checked
 * against the Org. A `building_id` from another agency finds no row — the read
 * runs as the caller, under RLS, filtered by the Org `requireMember` returned —
 * and becomes a refusal rather than a Property titled after someone else's
 * building.
 *
 * The created Building gets a name and nothing else. Its district and its map
 * link belong to จัดการโครงการ, which is a page rather than a field on this form.
 */
async function resolveBuilding(
  orgId: string,
  choice: { buildingId: string | null; newName: string | null },
): Promise<{ id: string; name: string }> {
  if (choice.buildingId) {
    const name = await buildingName(orgId, choice.buildingId)
    if (!name) throw new UnknownBuildingError()
    return { id: choice.buildingId, name }
  }

  const name = choice.newName as string
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('buildings')
    .insert({ org_id: orgId, name, district: '', province: '' })
    .select('id, name')
    .single()
  if (error) throw error

  return data as { id: string; name: string }
}

/** Best-effort removal of bytes no Property will point at. A failure here is
 *  logged and swallowed: the person's answer is already decided, and orphaned
 *  objects under a prefix nothing references are an operator's problem, not
 *  theirs. */
async function discard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return
  try {
    const { error } = await supabase.storage.from(BUCKET).remove(paths)
    if (error) throw error
  } catch (err) {
    console.error('[properties] could not remove orphaned uploads:', err)
  }
}
