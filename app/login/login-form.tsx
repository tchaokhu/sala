'use client'

import { useState } from 'react'
import {
  isAuthRetryableFetchError,
  type AuthError,
} from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-browser'
import type { LinkError } from '@/lib/auth-redirect'

export type { LinkError }

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'error'; message: string }

export function LoginForm({ next, linkError }: { next?: string; linkError?: LinkError }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })

  // Carries the intended destination through to /auth/callback, so it can
  // return the person to the page the middleware bounced them off. Shared by
  // both sign-in paths — the destination does not care which one got them in.
  function callbackUrl(): URL {
    const callback = new URL('/auth/callback', window.location.origin)
    if (next) callback.searchParams.set('next', next)
    return callback
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const address = email.trim()
    if (!address) return
    setState({ kind: 'sending' })

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        emailRedirectTo: callbackUrl().toString(),
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

  // Google has no client-side equivalent of shouldCreateUser:false — the
  // account either exists already or GoTrue refuses the sign-in server-side,
  // project-wide `disable_signup` being on (ADR 0011). Either way this call
  // just starts the redirect; /auth/callback is where the answer shows up.
  async function onGoogleLogin() {
    setState({ kind: 'sending' })
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl().toString() },
    })
    if (error) setState({ kind: 'error', message: describe(error) })
  }

  if (state.kind === 'sent') {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 text-sm">
        <p className="font-semibold text-ok">Link sent</p>
        <p className="mt-1 text-muted">
          Open the email at <span className="font-medium text-ink">{email.trim()}</span>{' '}
          and follow the link to log in. It works once and expires in an hour.
        </p>
      </div>
    )
  }

  const sending = state.kind === 'sending'

  return (
    <div className="flex flex-col gap-4">
      {/* Only while idle: once they have asked for another link the old failure
          is no longer the thing on screen. */}
      {linkError && state.kind === 'idle' && <LinkErrorNotice reason={linkError} />}

      <button
        type="button"
        onClick={onGoogleLogin}
        disabled={sending}
        className="rounded-lg border border-border bg-surface px-3 py-2 font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        Log in with Google
      </button>

      <div className="flex items-center gap-3 text-xs text-muted">
        <div className="h-px flex-1 bg-border" />
        <span>or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Email</span>
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
          {sending ? 'Sending…' : 'Send the login link'}
        </button>
      </form>
    </div>
  )
}

/** A link that did not work, and the one thing to do about it. The two reasons
 *  are separated because the instructions differ: an expired link is fixed from
 *  here, a link opened on the wrong device is not. */
function LinkErrorNotice({ reason }: { reason: LinkError }) {
  const copy =
    reason === 'device'
      ? {
          title: 'Open this link on the device that asked for it',
          body:
            'A login link only works in the browser that requested it. If you asked from a computer, open the email on that computer — or ask for a new link from the device you are using now.',
        }
      : reason === 'not-invited'
      ? {
          title: 'This Google account is not invited to Sala',
          body: 'Ask your agency admin to invite this email — or, if you already have access under a different address, log in with a magic link below instead.',
        }
      : {
          title: 'This link no longer works',
          body: 'It has expired or has already been used. Enter your email below to get a new one.',
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
    return 'Could not connect. Check your internet and try again.'
  }
  if (error.status === 429) {
    return 'Too many link requests. Wait a moment and try again.'
  }
  return 'Sending the link failed. Try again in a moment.'
}
