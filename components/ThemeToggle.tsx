'use client'

import { useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'

type Theme = 'light' | 'dark'

// The live theme is external state — it lives on <html data-theme>, put there by
// the no-flash script before React ran. useSyncExternalStore reads it without a
// setState-in-effect, and getServerSnapshot returns null so the server and the
// first hydration render agree (no icon) and the real icon appears once mounted.
// Both themes are designed, not inverted (globals.css); this only flips between.

let listeners: (() => void)[] = []
function subscribe(cb: () => void) {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}
function readTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'light' || attr === 'dark') return attr
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function setTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem('theme', theme)
  } catch {
    /* private mode: the choice just does not persist */
  }
  for (const l of listeners) l()
}

export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme | null>(subscribe, readTheme, () => null)

  const label = theme === 'dark' ? 'สลับเป็นธีมสว่าง' : 'สลับเป็นธีมมืด'

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition-colors hover:text-ink"
    >
      {/* null before hydration — render nothing rather than flash the wrong icon. */}
      {theme === 'dark' ? <Sun size={18} /> : theme === 'light' ? <Moon size={18} /> : null}
    </button>
  )
}
