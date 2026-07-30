'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase-admin'
import { cleanText, isEmail } from '@/lib/validate'
import { requireSuperadmin } from './guard'
import type { ActionResult } from '@/lib/action-result'

// The console's writes. Every one of them starts with requireSuperadmin — not
// because the layout forgot, but because a Server Action is an HTTP endpoint and
// no layout runs in front of one. tests/no-service-role-leak.test.ts fails the
// build if a 'use server' file under app/admin/ stops mentioning it.
//
// They touch Memberships and auth accounts. Nothing under Inventory, Tenancy or
// Leads (ADR 0006), and no action here changes anyone's login email — a role
// that could would be a role that can take over any account in the system.

/** Errors say what to do next and never carry raw Postgres text (CLAUDE.md).
 *  The detail still reaches the server log, where an operator can read it. */
function failed(what: string, err: unknown): ActionResult {
  console.error(`[admin] ${what}:`, err)
  return { ok: false, message: `${what}ไม่สำเร็จ ลองใหม่อีกครั้ง หากยังไม่ได้ให้ดูบันทึกของเซิร์ฟเวอร์` }
}

const ROLES = new Set(['owner', 'member'])

function readRole(value: FormDataEntryValue | null): 'owner' | 'member' | null {
  const role = typeof value === 'string' ? value : ''
  return ROLES.has(role) ? (role as 'owner' | 'member') : null
}

/** Add somebody to an Org, creating their account first if they have none.
 *
 *  Two steps rather than one because they fail differently: an address that
 *  already has an account is the common case (somebody joining a second Org),
 *  and inviting it again would be wrong. `admin_user_id_by_email` answers that
 *  in one indexed lookup instead of paging through every user. */
export async function addMember(formData: FormData): Promise<ActionResult> {
  await requireSuperadmin()

  const orgId = cleanText(formData.get('org_id'), 40)
  const slug = cleanText(formData.get('slug'), 40)
  const email = cleanText(formData.get('email'), 254).toLowerCase()
  const displayName = cleanText(formData.get('display_name'), 80)
  const role = readRole(formData.get('role'))

  if (!orgId || !slug) return { ok: false, message: 'ไม่พบเอเจนซี่ที่จะเพิ่มคนเข้า' }
  if (!isEmail(email)) return { ok: false, message: 'อีเมลไม่ถูกต้อง ตรวจสอบแล้วกรอกใหม่' }
  if (!role) return { ok: false, message: 'เลือกสิทธิ์เป็นเจ้าของหรือสมาชิก' }

  const supabase = createAdminClient()

  let userId: string
  let invited = false
  try {
    const { data: existing, error } = await supabase.rpc('admin_user_id_by_email', {
      p_email: email,
    })
    if (error) throw error

    if (existing) {
      userId = existing as string
    } else {
      // Creates the account and emails them. The link in that mail lands on
      // /auth/confirm, which verifies server-side — an invite is not started by
      // the recipient's browser, so it has no PKCE verifier and cannot go
      // through /auth/callback.
      const { data, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${await originUrl()}/auth/confirm?next=/o/${slug}`,
      })
      if (inviteError) throw inviteError
      if (!data.user) throw new Error('invite returned no user')
      userId = data.user.id
      invited = true
    }
  } catch (err) {
    return failed('การสร้างบัญชี', err)
  }

  try {
    const { error } = await supabase.from('memberships').insert({
      org_id: orgId,
      user_id: userId,
      role,
      display_name: displayName || null,
    })
    if (error) {
      // The composite primary key is (org_id, user_id).
      if (error.code === '23505') {
        return { ok: false, message: 'คนนี้อยู่ในเอเจนซี่นี้อยู่แล้ว' }
      }
      throw error
    }
  } catch (err) {
    return failed('การเพิ่มสมาชิก', err)
  }

  revalidatePath(`/admin/orgs/${slug}`)
  revalidatePath('/admin')
  return {
    ok: true,
    message: invited
      ? `เพิ่ม ${email} แล้ว ส่งอีเมลเชิญไปให้ หากเขาไม่ได้รับ ให้ไปที่หน้าเข้าสู่ระบบแล้วขอลิงก์เอง`
      : `เพิ่ม ${email} แล้ว บัญชีนี้มีอยู่ก่อนแล้ว เข้าสู่ระบบได้ทันที`,
  }
}

export async function setMemberRole(formData: FormData): Promise<ActionResult> {
  await requireSuperadmin()

  const orgId = cleanText(formData.get('org_id'), 40)
  const slug = cleanText(formData.get('slug'), 40)
  const userId = cleanText(formData.get('user_id'), 40)
  const role = readRole(formData.get('role'))

  if (!orgId || !userId || !role) return { ok: false, message: 'คำสั่งไม่ครบ ลองใหม่อีกครั้ง' }

  const supabase = createAdminClient()
  try {
    if (role === 'member') {
      const blocked = await wouldStrandOrg(orgId, userId)
      if (blocked) return blocked
    }

    const { error } = await supabase
      .from('memberships')
      .update({ role })
      .eq('org_id', orgId)
      .eq('user_id', userId)
    if (error) throw error
  } catch (err) {
    return failed('การเปลี่ยนสิทธิ์', err)
  }

  revalidatePath(`/admin/orgs/${slug}`)
  return { ok: true, message: role === 'owner' ? 'ตั้งเป็นเจ้าของแล้ว' : 'ตั้งเป็นสมาชิกแล้ว' }
}

export async function setMemberDisplayName(formData: FormData): Promise<ActionResult> {
  await requireSuperadmin()

  const orgId = cleanText(formData.get('org_id'), 40)
  const slug = cleanText(formData.get('slug'), 40)
  const userId = cleanText(formData.get('user_id'), 40)
  const name = cleanText(formData.get('display_name'), 80)

  if (!orgId || !userId) return { ok: false, message: 'คำสั่งไม่ครบ ลองใหม่อีกครั้ง' }

  const supabase = createAdminClient()
  try {
    const { error } = await supabase
      .from('memberships')
      // Blank clears it and the list falls back to the email, rather than
      // storing a string that renders as an empty cell.
      .update({ display_name: name || null })
      .eq('org_id', orgId)
      .eq('user_id', userId)
    if (error) throw error
  } catch (err) {
    return failed('การเปลี่ยนชื่อ', err)
  }

  revalidatePath(`/admin/orgs/${slug}`)
  return { ok: true, message: name ? `เปลี่ยนชื่อเป็น ${name} แล้ว` : 'ล้างชื่อแล้ว จะแสดงเป็นอีเมลแทน' }
}

/** Removes the Membership and leaves the account alone — the only removal that
 *  is reversible, and the only one inside ADR 0006's scope. Deleting the account
 *  would reach into every other Org this person belongs to. */
export async function removeMember(formData: FormData): Promise<ActionResult> {
  await requireSuperadmin()

  const orgId = cleanText(formData.get('org_id'), 40)
  const slug = cleanText(formData.get('slug'), 40)
  const userId = cleanText(formData.get('user_id'), 40)

  if (!orgId || !userId) return { ok: false, message: 'คำสั่งไม่ครบ ลองใหม่อีกครั้ง' }

  const supabase = createAdminClient()
  try {
    const blocked = await wouldStrandOrg(orgId, userId)
    if (blocked) return blocked

    const { error } = await supabase
      .from('memberships')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', userId)
    if (error) throw error
  } catch (err) {
    return failed('การเอาสมาชิกออก', err)
  }

  revalidatePath(`/admin/orgs/${slug}`)
  revalidatePath('/admin')
  return { ok: true, message: 'เอาออกจากเอเจนซี่แล้ว บัญชียังอยู่' }
}

/** Refuses the change that would leave an Org with no owner. Such an Org still
 *  works for its Members, but nobody inside it can add or remove anyone again —
 *  only an operator could repair it, and the repair is invisible from the Org's
 *  own screens. Cheaper to refuse than to explain later. */
async function wouldStrandOrg(orgId: string, userId: string): Promise<ActionResult | null> {
  const supabase = createAdminClient()

  const { data: owners, error } = await supabase.rpc('admin_owner_count', { p_org: orgId })
  if (error) throw error
  if ((owners as number) > 1) return null

  const { data: target, error: targetError } = await supabase
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()
  if (targetError) throw targetError
  if (target?.role !== 'owner') return null

  return {
    ok: false,
    message: 'คนนี้เป็นเจ้าของคนสุดท้ายของเอเจนซี่ ตั้งคนอื่นเป็นเจ้าของก่อนแล้วค่อยทำรายการนี้',
  }
}

/** The origin an invite link should come back to. Read from the request rather
 *  than hardcoded, so a link generated in development does not point at
 *  production — and vice versa. */
async function originUrl(): Promise<string> {
  const { headers } = await import('next/headers')
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}
