'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, requireMember } from '@/lib/supabase-server'
import { cleanText } from '@/lib/validate'
import {
  composePropertyTitle,
  imageExtension,
  parseBuildingChoice,
  parsePropertyEditForm,
  validatePropertyImageEdit,
} from '@/lib/property-input'
import { resolveBuilding, UnknownBuildingError } from '@/lib/buildings'
import { BUCKET, discard } from '@/lib/property-storage'
import { getPropertyForEdit } from '@/lib/properties'
import type { ActionResult } from '@/lib/action-result'

// Editing and removing a Property — see
// docs/adr/0009-property-edit-and-delete-do-not-invent-a-lie.md.
//
// Same gate as every other write (ADR 0002): Membership first, and the Org for
// the rest of the function comes from that, never from the form.
//
// Both actions here move bytes as well as rows, and the ordering is the mirror
// image of `createProperty`'s. Create writes objects before the row that names
// them, so a row can never point at bytes that never arrived. Edit and delete
// write the row *first* and sweep the objects after, so a live row can never
// point at bytes already gone — and a delete Postgres refuses never touches
// Storage at all.

function failed(what: string, err: unknown): ActionResult {
  console.error(`[properties] ${what}:`, err)
  return { ok: false, message: `${what}ไม่สำเร็จ ลองใหม่อีกครั้ง หากยังไม่ได้ให้แจ้งผู้ดูแลระบบ` }
}

const NOT_FOUND = 'ไม่พบทรัพย์นี้ อาจถูกลบไปแล้ว กลับไปที่รายการทรัพย์แล้วลองใหม่'

export async function updateProperty(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  const id = cleanText(formData.get('property_id'), 40)
  if (!slug || !id) return { ok: false, message: 'คำสั่งไม่ครบ ลองใหม่อีกครั้ง' }

  const org = await requireMember(slug)
  const supabase = await createClient()

  // The row as the database has it, not as the form describes it. Two things
  // hang off this read: the status lock (ADR 0009 — a `rented` Property cannot
  // be moved by an edit) and which photos this Property actually holds. Both
  // would be trivially defeatable if they came from hidden fields.
  const current = await getPropertyForEdit(org.id, id)
  if (!current) return { ok: false, message: NOT_FOUND }

  const parsed = parsePropertyEditForm(formData, current.status)
  if (!parsed.ok) return parsed

  const choice = parseBuildingChoice(formData)
  if (!choice.ok) return choice

  // Intersected with the row's own images: a path that is not on this Property
  // is dropped rather than passed to Storage. RLS would refuse another Org's
  // object anyway, and this means the request never gets to ask.
  const asked = new Set(
    formData.getAll('removed_images').filter((v): v is string => typeof v === 'string'),
  )
  const removed = current.images.filter((path) => asked.has(path))
  const kept = current.images.filter((path) => !asked.has(path))

  const files = formData
    .getAll('images')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0)
  const images = validatePropertyImageEdit(kept.length, files)
  if (!images.ok) return images

  let building: { id: string; name: string }
  try {
    building = await resolveBuilding(org.id, choice.values)
  } catch (err) {
    if (err instanceof UnknownBuildingError) {
      return { ok: false, message: 'ไม่พบโครงการที่เลือก เลือกใหม่อีกครั้ง' }
    }
    return failed('การเพิ่มโครงการ', err)
  }

  // Keys are minted before anything is uploaded so the sweep on failure can name
  // them. They are random rather than create's sequential `{n}.{ext}`: on an
  // edit some of those indices are still held by kept photos, and counting from
  // zero again would upsert over one of them.
  const targets = files.map((file) => ({
    file,
    path: `${org.id}/${id}/${crypto.randomUUID()}.${imageExtension(file.type) as string}`,
  }))

  try {
    await Promise.all(
      targets.map(async ({ file, path }) => {
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false })
        if (error) throw error
      }),
    )
  } catch (err) {
    await discard(
      supabase,
      targets.map((t) => t.path),
    )
    return failed('การอัปโหลดรูป', err)
  }

  const { data, error } = await supabase
    .from('properties')
    .update({
      ...parsed.values,
      building_id: building.id,
      // Recomposed, because either half may have just changed — a new room
      // number or a different โครงการ. The name still comes from the Building
      // row, never from the form (ADR 0008).
      title: composePropertyTitle(building.name, parsed.values.room_number),
      images: [...kept, ...targets.map((t) => t.path)],
    })
    .eq('id', id)
    .eq('org_id', org.id)
    .select('id')
    .maybeSingle()

  if (error) {
    await discard(
      supabase,
      targets.map((t) => t.path),
    )
    return failed('การแก้ไขทรัพย์', error)
  }
  if (!data) {
    // Read a moment ago, gone now: somebody deleted it between the two. The new
    // uploads have nothing pointing at them.
    await discard(
      supabase,
      targets.map((t) => t.path),
    )
    return { ok: false, message: NOT_FOUND }
  }

  // Only now, with the row no longer naming them. The reverse order would leave
  // a live Property pointing at bytes that are already gone if the update then
  // failed (ADR 0009).
  await discard(supabase, removed)

  revalidatePath(`/o/${slug}/properties`)
  revalidatePath(`/o/${slug}/properties/${id}/edit`)
  revalidatePath(`/o/${slug}`)
  return { ok: true, message: 'บันทึกแล้ว' }
}

/**
 * Removing a Property.
 *
 * `rentals.property_id` and `payments.property_id` are both ON DELETE RESTRICT,
 * so a Property that has ever carried a Rental or a Payment cannot be removed —
 * Postgres refuses it with SQLSTATE 23503 and this says so in Thai. It explains
 * and stops there: there is no Rental-management flow in the product yet, so an
 * instruction like "end the Rental first" would name a door that does not exist
 * (ADR 0009).
 *
 * The delete and the read of what to sweep are the same statement, so the image
 * paths come back only if the row actually went. A blocked delete returns before
 * Storage is touched at all.
 */
export async function deleteProperty(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  const id = cleanText(formData.get('property_id'), 40)
  if (!slug || !id) return { ok: false, message: 'คำสั่งไม่ครบ ลองใหม่อีกครั้ง' }

  const org = await requireMember(slug)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('properties')
    .delete()
    .eq('id', id)
    .eq('org_id', org.id)
    .select('images')
    .maybeSingle()

  if (error) {
    if (error.code === '23503') {
      return {
        ok: false,
        message:
          'ลบทรัพย์นี้ไม่ได้ เพราะมีสัญญาเช่าหรือรายการเงินผูกอยู่ ' +
          'ประวัติเหล่านั้นต้องอ้างถึงทรัพย์นี้ต่อไป จึงลบทรัพย์ออกจากระบบไม่ได้',
      }
    }
    return failed('การลบทรัพย์', error)
  }
  if (!data) return { ok: false, message: NOT_FOUND }

  // After the delete committed, never before: nothing points at these bytes now,
  // and a delete Postgres refused never reaches this line (ADR 0009).
  const images = (data as { images: string[] | null }).images ?? []
  await discard(supabase, images)

  revalidatePath(`/o/${slug}/properties`)
  revalidatePath(`/o/${slug}`)
  // Throws NEXT_REDIRECT, so it stays outside any try — a catch here would
  // swallow the navigation. The edit page this was posted from is gone.
  redirect(`/o/${slug}/properties?deleted=1`)
}
