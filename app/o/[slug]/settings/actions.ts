'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient, requireMember } from '@/lib/supabase-server'
import { cleanText, isEmail } from '@/lib/validate'
import type { ActionResult } from '@/lib/action-result'

// What a person may change about themselves. Both actions begin by establishing
// Membership (ADR 0002) and neither goes near the service role — a member
// renaming themselves is an ordinary write by an ordinary caller.
//
// Nothing here can change anybody else. `set_my_display_name` matches on
// auth.uid() inside the database, so the Org slug is the only thing this code
// supplies and there is no user id to get wrong.

export async function renameSelf(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  const name = cleanText(formData.get('display_name'), 80)
  if (!slug) return { ok: false, message: 'ไม่พบเอเจนซี่' }

  const org = await requireMember(slug)
  const supabase = await createClient()

  const { error } = await supabase.rpc('set_my_display_name', {
    p_org: org.id,
    p_name: name,
  })
  if (error) {
    console.error('[settings] renameSelf:', error)
    return { ok: false, message: 'บันทึกชื่อไม่สำเร็จ ลองใหม่อีกครั้ง' }
  }

  revalidatePath(`/o/${slug}/settings`)
  return {
    ok: true,
    message: name ? `เปลี่ยนชื่อเป็น ${name} แล้ว` : 'ล้างชื่อแล้ว จะแสดงเป็นอีเมลแทน',
  }
}

/** Changing your own login email. Supabase confirms at both addresses before
 *  anything moves, so this reports "check your mail", never "done" — saying
 *  otherwise would leave somebody believing they had changed the address they
 *  sign in with when they had not. */
export async function changeOwnEmail(formData: FormData): Promise<ActionResult> {
  const slug = cleanText(formData.get('slug'), 40)
  const email = cleanText(formData.get('email'), 254).toLowerCase()
  if (!slug) return { ok: false, message: 'ไม่พบเอเจนซี่' }
  if (!isEmail(email)) return { ok: false, message: 'อีเมลไม่ถูกต้อง ตรวจสอบแล้วกรอกใหม่' }

  // Establishes that the caller is who the session says, in an Org they belong
  // to, before touching their account.
  await requireMember(slug)
  const supabase = await createClient()

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')

  // The confirmation link is not started by a browser doing PKCE, so it lands on
  // /auth/confirm and is verified server-side.
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${proto}://${host}/auth/confirm?next=/o/${slug}/settings` },
  )

  if (error) {
    console.error('[settings] changeOwnEmail:', error)
    if (error.status === 422) {
      return { ok: false, message: 'อีเมลนี้มีบัญชีอยู่แล้ว ใช้อีเมลอื่น' }
    }
    if (error.status === 429) {
      return { ok: false, message: 'ขอเปลี่ยนถี่เกินไป รอสักครู่แล้วลองใหม่' }
    }
    return { ok: false, message: 'เปลี่ยนอีเมลไม่สำเร็จ ลองใหม่อีกครั้ง' }
  }

  return {
    ok: true,
    message: `ส่งลิงก์ยืนยันไปที่ ${email} แล้ว อีเมลจะยังไม่เปลี่ยนจนกว่าจะกดยืนยัน — Supabase ส่งไปทั้งที่อยู่เดิมและที่อยู่ใหม่`,
  }
}
