'use client'

// Picking a Building: type to search, or type a name that does not exist yet.
//
// It posts two fields. `building_id` is set only when something was chosen off
// the list; `building_name` is whatever is in the box. The action prefers the
// id, and reads that Building's name from the database rather than trusting the
// text — so the title a Property ends up with always matches the Building it
// actually points at (ADR 0008).
//
// Typing again clears the id, which is the whole trick: it is how "I meant a
// different one" and "this one is new" are the same gesture.

import { useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import type { BuildingOption } from '@/lib/buildings'
import { INPUT } from './form'

export function BuildingCombobox({
  options,
  capped,
  disabled,
  initial,
  onChoose,
}: {
  options: BuildingOption[]
  /** True when the Org has more Buildings than one read returns. Said out loud,
   *  so a Building missing from the list reads as "there are more" rather than
   *  "it is gone". */
  capped: boolean
  disabled?: boolean
  /** The Building this already points at, on edit. Null on create, and null on
   *  an ETL-imported Property that has no Building yet — which then reads as an
   *  empty required box, because saving one means picking a Building first. */
  initial?: BuildingOption | null
  /** The chosen Building, or null while a new name is being typed — the form
   *  uses it to preview that Building's map. */
  onChoose?: (option: BuildingOption | null) => void
}) {
  const [query, setQuery] = useState(initial?.name ?? '')
  const [chosen, setChosen] = useState<BuildingOption | null>(initial ?? null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('th')
    const pool = term
      ? options.filter((o) => o.name.toLocaleLowerCase('th').includes(term))
      : options
    // Bounded for the eye as well as the DOM: nobody reads past ten.
    return pool.slice(0, 10)
  }, [options, query])

  const exact = options.some((o) => o.name.trim() === query.trim())
  const creating = query.trim().length > 0 && !exact

  function choose(option: BuildingOption) {
    setChosen(option)
    setQuery(option.name)
    setOpen(false)
    onChoose?.(option)
  }

  function retype(value: string) {
    setQuery(value)
    setChosen(null)
    setOpen(true)
    setActive(0)
    onChoose?.(null)
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      {/* Only set when something was picked. Blank means "create the name in
          building_name", which the action decides, not this component. */}
      <input type="hidden" name="building_id" value={chosen?.id ?? ''} />

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          name="building_name"
          role="combobox"
          aria-expanded={open}
          aria-controls="building-options"
          aria-autocomplete="list"
          autoComplete="off"
          required
          maxLength={200}
          disabled={disabled}
          value={query}
          placeholder="Type to search, or type a new Building name"
          className={`${INPUT} w-full pr-9`}
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
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show the Building list"
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

      {open && (matches.length > 0 || creating) && (
        <ul
          id="building-options"
          role="listbox"
          className="absolute top-full z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          {matches.map((option, index) => (
            <li key={option.id}>
              <button
                type="button"
                role="option"
                aria-selected={chosen?.id === option.id}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
                className={
                  'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ' +
                  (index === active ? 'bg-bg text-ink' : 'text-muted hover:text-ink')
                }
              >
                <span className="min-w-0">
                  <span className="block truncate text-ink">{option.name}</span>
                  {option.district && (
                    <span className="block truncate text-xs text-muted">{option.district}</span>
                  )}
                </span>
                {chosen?.id === option.id && <Check size={16} aria-hidden className="shrink-0" />}
              </button>
            </li>
          ))}

          {creating && (
            <li className="border-t border-border px-3 py-2 text-sm text-muted">
              <span className="flex items-center gap-1.5">
                <Plus size={14} aria-hidden />
                Will create a new Building “<span className="text-ink">{query.trim()}</span>”
              </span>
            </li>
          )}
        </ul>
      )}

      {capped && (
        <span className="text-xs text-muted">
          Showing the first {options.length} Buildings — if yours is not here, search for it on the
          Buildings page
        </span>
      )}
    </div>
  )
}
