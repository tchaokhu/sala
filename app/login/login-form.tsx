'use client'

import { useState } from 'react'
import {
  isAuthRetryableFetchError,
  type AuthError,
} from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-browser'

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'error'; message: string }

/** Why the callback sent them back here, if it did. */
export type LinkError = 'expired' | 'device'

export function LoginForm({ next, linkError }: { next?: string; linkError?: LinkError }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const address = email.trim()
    if (!address) return
    setState({ kind: 'sending' })

    const supabase = createClient()
    const callback = new URL('/auth/callback', window.location.origin)
    // Carry the intended destination through the magic link so the callback can
    // return the person to the page the middleware bounced them off.
    if (next) callback.searchParams.set('next', next)

    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        emailRedirectTo: callback.toString(),
        // Invite-only, and this is what makes it true. The default is to create
        // the account, which would let anyone who can type an address mint a
        // user and make us send mail to it — the opposite of what this page says.
        shouldCreateUser: false,
      },
    })

    if (error && !isUnknownAddress(error)) {
      setState({ kind: 'error', message: describe(error) })
      return
    }
    setState({ kind: 'sent' })
  }

  if (state.kind === 'sent') {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 text-sm">
        <p className="font-semibold text-ok">ส่งลิงก์แล้ว</p>
        <p className="mt-1 text-muted">
          เปิดอีเมล <span className="font-medium text-ink">{email.trim()}</span>{' '}
          แล้วกดลิงก์เพื่อเข้าสู่ระบบ ลิงก์ใช้ได้ครั้งเดียวและหมดอายุใน 1 ชั่วโมง
        </p>
      </div>
    )
  }

  const sending = state.kind === 'sending'

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {/* Only while idle: once they have asked for another link the old failure
          is no longer the thing on screen. */}
      {linkError && state.kind === 'idle' && <LinkErrorNotice reason={linkError} />}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">อีเมล</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={sending}
          placeholder="you@agency.co.th"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60"
        />
      </label>

      {state.kind === 'error' && (
        <p className="text-sm text-warn">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="rounded-lg bg-accent px-3 py-2 font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {sending ? 'กำลังส่ง…' : 'ส่งลิงก์เข้าสู่ระบบ'}
      </button>
    </form>
  )
}

/** A link that did not work, and the one thing to do about it. The two reasons
 *  are separated because the instructions differ: an expired link is fixed from
 *  here, a link opened on the wrong device is not. */
function LinkErrorNotice({ reason }: { reason: LinkError }) {
  const copy =
    reason === 'device'
      ? {
          title: 'ลิงก์นี้ต้องเปิดบนเครื่องเดิม',
          body:
            'ลิงก์เข้าสู่ระบบใช้ได้เฉพาะในเบราว์เซอร์ที่กดขอ ถ้าขอจากคอมพิวเตอร์ ให้เปิดอีเมลบนคอมพิวเตอร์เครื่องนั้น หรือขอลิงก์ใหม่จากเครื่องที่กำลังใช้อยู่นี้',
        }
      : {
          title: 'ลิงก์นี้ใช้ไม่ได้แล้ว',
          body: 'ลิงก์หมดอายุหรือถูกใช้ไปแล้ว กรอกอีเมลด้านล่างเพื่อขอลิงก์ใหม่',
        }

  return (
    <div className="rounded-lg border border-warn bg-surface p-4 text-sm" role="status">
      <p className="font-semibold text-warn">{copy.title}</p>
      <p className="mt-1 text-muted">{copy.body}</p>
    </div>
  )
}

/** The one failure that must not reach the screen. With account creation off, an
 *  address nobody has been invited under comes back as `otp_disabled`; showing it
 *  would turn this form into an oracle for who is registered. Everything else is
 *  a fact about us, not about who exists, and is safe to say out loud. */
function isUnknownAddress(error: AuthError): boolean {
  return error.code === 'otp_disabled' || error.status === 422
}

function describe(error: AuthError): string {
  if (isAuthRetryableFetchError(error)) {
    return 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'
  }
  if (error.status === 429) {
    return 'ขอลิงก์ถี่เกินไป รอสักครู่แล้วลองใหม่'
  }
  return 'ส่งลิงก์ไม่สำเร็จ ลองใหม่อีกครั้งในอีกสักครู่'
}
