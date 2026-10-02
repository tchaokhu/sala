'use client'

// What every Save and Delete shows while it runs and when it is done.
//
// While an action runs: the Sala mark building itself over a dimmed page, which
// also stops a second click. Only after 300 ms — a fast save does not flash it —
// and, once shown, for at least 400 ms so it never blinks.
//
// When it succeeds: a toast, bottom right (bottom centre on a phone), with a ✓,
// the headline and the second line that says which one. Gone after 4 s — 8 s
// for a long one — or when closed; a new one replaces the old. Failures do not
// toast: they stay beside the form (Notice), where what to fix can be read.
//
// useFormAction (components/form.tsx) drives both, so a form gets them without
// doing anything. A redirecting action leaves its toast in a cookie
// (lib/flash.ts), read here when the page it lands on mounts.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { CheckCircle2, X } from 'lucide-react'
import { SalaLoader } from './SalaLoader'

type Toast = { message: string; detail?: string }

const FeedbackContext = createContext<{
  begin: (label: string) => void
  end: () => void
  toast: (t: Toast) => void
} | null>(null)

/** Null outside the provider — the login page — where forms simply do without. */
export function useFeedback() {
  return useContext(FeedbackContext)
}

const SHOW_AFTER = 300
const SHOW_AT_LEAST = 400
const FLASH_COOKIE = 'sala_flash'

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const [toast, setToast] = useState<(Toast & { key: number }) | null>(null)
  const timers = useRef<{ show?: number; shownAt?: number }>({})
  const pathname = usePathname()

  const begin = useCallback((label: string) => {
    setBusy(label)
    window.clearTimeout(timers.current.show)
    timers.current.show = window.setTimeout(() => {
      timers.current.shownAt = Date.now()
      setShown(true)
    }, SHOW_AFTER)
  }, [])

  const end = useCallback(() => {
    window.clearTimeout(timers.current.show)
    const since = timers.current.shownAt ? Date.now() - timers.current.shownAt : SHOW_AT_LEAST
    window.setTimeout(() => {
      timers.current.shownAt = undefined
      setShown(false)
      setBusy(null)
    }, Math.max(0, SHOW_AT_LEAST - since))
  }, [])

  const show = useCallback((t: Toast) => setToast({ ...t, key: Date.now() }), [])

  // A page a redirect landed on: end the loader the action began, and show the
  // toast it left behind.
  useEffect(() => {
    end()
    const raw = document.cookie.split('; ').find((c) => c.startsWith(`${FLASH_COOKIE}=`))
    if (!raw) return
    let toast: Toast
    try {
      toast = JSON.parse(decodeURIComponent(raw.slice(FLASH_COOKIE.length + 1))) as Toast
    } catch {
      return // A cookie this did not write: nothing to say.
    }
    // After the landed page has painted, not inside this effect's render pass —
    // and the cookie goes only then, so a pass that is cleaned up before its
    // timer fires (Strict Mode runs effects twice) leaves it for the next.
    const t = window.setTimeout(() => {
      document.cookie = `${FLASH_COOKIE}=; path=/; max-age=0`
      show(toast)
    }, 0)
    return () => window.clearTimeout(t)
  }, [pathname, end, show])

  useEffect(() => {
    if (!toast) return
    const long = (toast.detail ?? '').length > 80
    const t = window.setTimeout(() => setToast(null), long ? 8000 : 4000)
    return () => window.clearTimeout(t)
  }, [toast])

  return (
    <FeedbackContext.Provider value={{ begin, end, toast: show }}>
      {children}
      {shown &&
        busy &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex bg-black/50">
            <SalaLoader label={busy} />
          </div>,
          document.body,
        )}
      {toast &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex justify-center sm:inset-x-auto sm:right-4 sm:justify-end">
            <div
              key={toast.key}
              role="status"
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border bg-surface p-4 text-ink shadow-lg"
            >
              <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0 text-ok" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{toast.message}</p>
                {toast.detail && <p className="mt-0.5 text-sm break-words text-muted">{toast.detail}</p>}
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setToast(null)}
                className="shrink-0 text-muted transition-colors hover:text-ink"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
          </div>,
          document.body,
        )}
    </FeedbackContext.Provider>
  )
}
