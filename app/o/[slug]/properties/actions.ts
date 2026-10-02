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
import { resolveBuilding, UnknownBuildingError } from '@/lib/buildings'
import { ownerBelongsToOrg } from '@/lib/owners'
import { BUCKET, discard } from '@/lib/property-storage'
import type { ActionResult } from '@/lib/action-result'
import { flash } from '@/lib/flash'

// Creating a Property. The first write in the product that moves bytes as well
// as rows — see docs/adr/0007-property-photos-upload-through-the-server-action.md.
//
// ADR 0002 in three lines: this is a Server Action, it begins by establishing
// Membership, and the Org it writes into comes from that gate rather than from
// anything the form sent. The `slug` field names which Org to *resolve*; a
// caller holding no Membership there is refused before a single byte is stored.
// RLS is the second check, not the only one.
//
// The bucket, the Storage sweep and `resolveBuilding` live in lib/ rather than
// here: editing a Property needs all three, and the ordering rules around them
// (ADR 0007, ADR 0009) only hold if both paths run the same code.

/** Errors say what to do next and never carry raw Postgres or Storage text
 *  (CLAUDE.md). The detail goes to the server log, where an operator can read
 *  it. Nothing from the form is logged — a Property's title is not sensitive,
 *  but making the log a copy of user input is the habit that later leaks a
 *  Tenant's id_card. */
function failed(what: string, err: unknown): ActionResult {
  console.error(`[properties] ${what}:`, err)
  return { ok: false, message: `${what} failed. Try again, and tell your administrator if it keeps failing.` }
}

export async function createProperty(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  if (!slug) return { ok: false, message: 'Org not found' }

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
      return { ok: false, message: 'The Building you chose was not found. Choose it again.' }
    }
    return failed('Adding the Building', err)
  }

  // The other id the form carries, checked the same way and in the same place —
  // before any byte moves, because it can still refuse. An owner_id naming
  // another agency's Owner finds no row under RLS (the read runs as the caller,
  // filtered by the Org `requireMember` returned) and becomes a refusal rather
  // than a Property pointing at a stranger. Null skips it: no Owner is an
  // ordinary answer.
  if (parsed.values.owner_id && !(await ownerBelongsToOrg(org.id, parsed.values.owner_id))) {
    return { ok: false, message: 'The Owner you chose was not found. Choose it again.' }
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
    return failed('Uploading the photos', err)
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
    return failed('Adding the Property', error)
  }

  revalidatePath(`/o/${slug}/properties`)
  revalidatePath(`/o/${slug}`)
  // Throws NEXT_REDIRECT, so it goes after everything that can fail and outside
  // any try — a catch here would swallow the navigation.
  await flash(
    'Property added',
    paths.length ? `${row.title} · ${paths.length} ${paths.length === 1 ? 'photo' : 'photos'}` : row.title,
  )
  redirect(`/o/${slug}/properties`)
}
