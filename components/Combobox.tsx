'use client'

// The one combobox: type to filter a list, pick off it with the mouse or the
// keyboard (↑ ↓ Enter Esc). Every picker in Sala is a thin wrapper that maps its
// rows to `ComboItem`s and says what happens off the list.
//
// The standard, for every one of them:
//   - opened with nothing typed, it lists every item it was given, in a
//     scrolling box — the loads are bounded where they are read (`capped`);
//   - the search matches every text an item shows: label, sub line, `terms`;
//   - the chosen item carries a ✓ and its id is posted in `idName`.
//
// Typing again clears the choice, so "I meant a different one" and "this one is
// new" are the same gesture. Typing an item's exact name — its label, or the
// other-language name in `terms` — picks it when exactly one item has it, so a
// name typed in full is not mistaken for a new one.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Plus, X } from 'lucide-react'
import { INPUT } from './styles'

export type ComboItem = {
  id: string
  /** The main line, and what fills the box once picked unless `display` says otherwise. */
  label: string
  /** The muted second line. */
  sub?: string
  /** What fills the box once picked, when it is not the label. */
  display?: string
  /** Further text the search should match without showing it — the other
   *  language's name, which typed in full also picks the item. */
  terms?: string
}

export function Combobox({
  items,
  idName,
  textName,
  initialId,
  placeholder,
  listLabel,
  required,
  disabled,
  maxLength = 240,
  clearLabel,
  createNote,
  emptyNote,
  cappedNote,
  onChoose,
  onCreatingChange,
}: {
  items: ComboItem[]
  /** The hidden field the chosen id is posted in — blank when nothing is chosen. */
  idName: string
  /** Also post what is typed, under this name — for pickers that can create. */
  textName?: string
  initialId?: string | null
  placeholder: string
  /** "Show the Owner list" — the chevron's name for a screen reader. */
  listLabel: string
  required?: boolean
  disabled?: boolean
  maxLength?: number
  /** Gives the box an ✕ that empties it, for a choice that may be blank. */
  clearLabel?: string
  /** Shown under the list while the text matches no picked item: what saving
   *  will create. Its presence is what makes the picker one that creates. */
  createNote?: (text: string) => React.ReactNode
  /** Shown when nothing matches, for a picker that cannot create. */
  emptyNote?: (text: string) => React.ReactNode
  /** Shown under the box when the load hit its bound. */
  cappedNote?: React.ReactNode
  onChoose?: (id: string | null) => void
  onCreatingChange?: (creating: boolean) => void
}) {
  const initial = items.find((i) => i.id === initialId) ?? null
  const [query, setQuery] = useState(initial ? boxText(initial) : '')
  const [chosen, setChosen] = useState<ComboItem | null>(initial)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const matches = useMemo(() => {
    // A settled choice is not a search term: reopening the list shows it all.
    const settled = chosen !== null && query === boxText(chosen)
    const term = settled ? '' : query.trim().toLocaleLowerCase('th')
    if (!term) return items
    return items.filter((i) =>
      [i.label, i.sub, i.display, i.terms].join(' ').toLocaleLowerCase('th').includes(term),
    )
  }, [items, query, chosen])

  const typed = query.trim()
  const creating = !!createNote && typed.length > 0 && !chosen
  const unmatched = !createNote && typed.length > 0 && !chosen && matches.length === 0

  useEffect(() => onCreatingChange?.(creating), [creating, onCreatingChange])

  function choose(item: ComboItem) {
    setChosen(item)
    setQuery(boxText(item))
    setOpen(false)
    onChoose?.(item.id)
  }

  function retype(value: string) {
    setQuery(value)
    setOpen(true)
    setActive(0)
    const name = value.trim()
    const exact = items.filter((i) => [i.label, i.display, i.terms].includes(name))
    if (exact.length === 1) {
      setChosen(exact[0])
      onChoose?.(exact[0].id)
    } else {
      setChosen(null)
      onChoose?.(null)
    }
  }

  function clear() {
    setChosen(null)
    setQuery('')
    setOpen(false)
    onChoose?.(null)
    inputRef.current?.focus()
  }

  const showClear = !!clearLabel && query.length > 0

  return (
    <div className="relative flex flex-col gap-1.5">
      <input type="hidden" name={idName} value={chosen?.id ?? ''} />

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          name={textName}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          required={required}
          maxLength={maxLength}
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          className={`${INPUT} w-full ${showClear ? 'pr-16' : 'pr-9'}`}
          onChange={(event) => retype(event.target.value)}
          onFocus={() => setOpen(true)}
          // A click on an option must land before the list closes.
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setOpen(true)
              setActive((i) => Math.min(i + 1, matches.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive((i) => Math.max(i - 1, 0))
            } else if (event.key === 'Enter' && open && matches[active]) {
              // Enter picks the highlighted row rather than submitting the form
              // half-filled.
              event.preventDefault()
              choose(matches[active])
            } else if (event.key === 'Escape') {
              setOpen(false)
            }
          }}
        />

        {showClear && (
          <button
            type="button"
            aria-label={clearLabel}
            disabled={disabled}
            onClick={clear}
            className="absolute top-1/2 right-8 -translate-y-1/2 text-muted transition-colors hover:text-ink disabled:opacity-60"
          >
            <X size={16} aria-hidden />
          </button>
        )}

        <button
          type="button"
          tabIndex={-1}
          aria-label={listLabel}
          disabled={disabled}
          onClick={() => {
            setOpen((was) => !was)
            inputRef.current?.focus()
          }}
          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted transition-colors hover:text-ink"
        >
          <ChevronDown size={16} aria-hidden />
        </button>
      </div>

      {open && (matches.length > 0 || creating || unmatched) && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          {matches.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={chosen?.id === item.id}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(item)}
                className={
                  'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ' +
                  (index === active ? 'bg-bg text-ink' : 'text-muted hover:text-ink')
                }
              >
                <span className="min-w-0">
                  <span className="block truncate text-ink">{item.label}</span>
                  {item.sub && <span className="tabular block truncate text-xs text-muted">{item.sub}</span>}
                </span>
                {chosen?.id === item.id && <Check size={16} aria-hidden className="shrink-0" />}
              </button>
            </li>
          ))}

          {creating && (
            <li className="border-t border-border px-3 py-2 text-sm text-muted">
              <span className="flex items-center gap-1.5">
                <Plus size={14} aria-hidden className="shrink-0" />
                <span>{createNote(typed)}</span>
              </span>
            </li>
          )}

          {unmatched && emptyNote && <li className="px-3 py-2 text-sm text-muted">{emptyNote(typed)}</li>}
        </ul>
      )}

      {cappedNote && <span className="text-xs text-muted">{cappedNote}</span>}
    </div>
  )
}

function boxText(item: ComboItem): string {
  return item.display ?? item.label
}
