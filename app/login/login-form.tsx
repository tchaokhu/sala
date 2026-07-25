'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'error'; message: string }

export function LoginForm({ next }: { next?: string }) {
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
      options: { emailRedirectTo: callback.toString() },
    })

    // Do not reveal whether the address belongs to a user: a wrong email and a
    // real one both report "check your inbox". Invite-only means a probe here
    // should learn nothing. A genuine transport failure is the only error shown.
    if (error && error.status && error.status >= 500) {
      setState({ kind: 'error', message: 'ส่งลิงก์ไม่สำเร็จ ลองใหม่อีกครั้งในอีกสักครู่' })
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
