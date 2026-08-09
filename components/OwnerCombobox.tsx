'use client'

// Picking an Owner: type to search the ones already on file, or leave it empty.
//
// It posts one field, `owner_id`, and only when something was chosen off the
// list. There is no "create this one" branch the way BuildingCombobox has,
// because `owners.phone` is NOT NULL — a name typed into a box cannot make a
// legal Owner row, so a new person is added on the Owners page first.
//
// Which is also why an unmatched name has to say so out loud: the text in the
// box is never posted, so a half-typed name would otherwise save as no Owner
// at all without ever admitting it.

import { useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import type { OwnerOption } from '@/lib/owners'
import { INPUT } from './form'

export function OwnerCombobox({
  options,
  capped,
  disabled,
  initial,
}: {
  options: OwnerOption[]
  /** True when the Org has more Owners than one read returns. Said out loud, so
   *  an Owner missing from the list reads as "there are more" rather than "they
   *  are gone". */
  capped: boolean
  disabled?: boolean
  /** The Owner this already points at, on edit. Null on create, and null on any
   *  Property whose Owner is simply not on file — which is a normal Property,
   *  not an unfinished one. */
  initial?: OwnerOption | null
}) {
  const [query, setQuery] = useState(initial ? label(initial) : '')
  const [chosen, setChosen] = useState<OwnerOption | null>(initial ?? null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => {
    // A settled choice is not a search term: the box then reads "name — phone",
    // which matches no name and no number, and reopening the list would show
    // nothing at all.
    const settled = chosen !== null && query === label(chosen)
    const term = settled ? '' : query.trim().toLocaleLowerCase('th')
    // Phone as well as name, for the same reason the option shows both: two
    // Owners with one name are told apart by the number, and the number is what
    // an agent has in front of them.
    const pool = term
      ? options.filter(
          (o) => o.name.toLocaleLowerCase('th').includes(term) || o.phone.includes(term),
        )
      : options
    // Bounded for the eye as well as the DOM: nobody reads past ten.
    return pool.slice(0, 10)
  }, [options, query, chosen])

  const unmatched = query.trim().length > 0 && !chosen && matches.length === 0

  function choose(option: OwnerOption) {
    setChosen(option)
    setQuery(label(option))
    setOpen(false)
  }

  function clear() {
    setChosen(null)
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  function retype(value: string) {
    setQuery(value)
    setChosen(null)
    setOpen(true)
    setActive(0)
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      {/* Blank means no Owner, which is a legal state for every Property. The
          action re-checks a non-blank one against the Org before it writes. */}
      <input type="hidden" name="owner_id" value={chosen?.id ?? ''} />

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="owner-options"
          aria-autocomplete="list"
          autoComplete="off"
          maxLength={240}
          disabled={disabled}
          value={query}
          placeholder="Type a name or phone number to search"
          className={`${INPUT} w-full ${query ? 'pr-16' : 'pr-9'}`}
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

        {/* Building's combobox has no clear button because a Building can never
            be blank. An Owner can, so taking one off has to be one gesture. */}
        {query && (
          <button
            type="button"
            aria-label="Clear the Owner"
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
          aria-label="Show the Owner list"
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

      {open && (matches.length > 0 || unmatched) && (
        <ul
          id="owner-options"
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
                  <span className="tabular block truncate text-xs text-muted">{option.phone}</span>
                </span>
                {chosen?.id === option.id && <Check size={16} aria-hidden className="shrink-0" />}
              </button>
            </li>
          ))}

          {unmatched && (
            <li className="px-3 py-2 text-sm text-muted">
              No Owner matches “<span className="text-ink">{query.trim()}</span>” — add them on the
              Owners page, then come back
            </li>
          )}
        </ul>
      )}

      {capped && (
        <span className="text-xs text-muted">
          Showing the first {options.length} Owners — if yours is not here, search for them on the
          Owners page
        </span>
      )}
    </div>
  )
}

/** What sits in the box once one is picked: the pair that tells two people with
 *  the same name apart. */
function label(owner: OwnerOption): string {
  return `${owner.name} — ${owner.phone}`
}
