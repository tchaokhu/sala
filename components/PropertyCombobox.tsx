'use client'

// Picking the Property a Rental lets: only the ones with no active Rental, and
// only off the list — there is no "create" branch, because a Property is added
// on its own page first. Posts `property_id`; the action re-checks it against
// the Org.

import { useMemo, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { RentableProperty } from '@/lib/rentals'
import { formatBaht } from '@/lib/format'
import { INPUT } from './form'

export function PropertyCombobox({
  options,
  capped,
  disabled,
  initial,
  onChoose,
}: {
  options: RentableProperty[]
  capped: boolean
  disabled?: boolean
  initial?: RentableProperty | null
  onChoose?: (option: RentableProperty | null) => void
}) {
  const [query, setQuery] = useState(initial?.title ?? '')
  const [chosen, setChosen] = useState<RentableProperty | null>(initial ?? null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => {
    const settled = chosen !== null && query === chosen.title
    const term = settled ? '' : query.trim().toLocaleLowerCase('th')
    const pool = term ? options.filter((o) => o.title.toLocaleLowerCase('th').includes(term)) : options
    return pool.slice(0, 10)
  }, [options, query, chosen])

  const unmatched = query.trim().length > 0 && !chosen && matches.length === 0

  function choose(option: RentableProperty) {
    setChosen(option)
    setQuery(option.title)
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
      <input type="hidden" name="property_id" value={chosen?.id ?? ''} />

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="property-options"
          aria-autocomplete="list"
          autoComplete="off"
          required
          maxLength={240}
          disabled={disabled}
          value={query}
          placeholder="Type to search the Properties with no active Rental"
          className={`${INPUT} w-full pr-9`}
          onChange={(event) => retype(event.target.value)}
          onFocus={() => setOpen(true)}
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
          aria-label="Show the Property list"
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
          id="property-options"
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
                  <span className="block truncate text-ink">{option.title}</span>
                  <span className="tabular block truncate text-xs text-muted">
                    {formatBaht(option.priceMonthly)}/month
                    {option.ownerName && ` · ${option.ownerName}`}
                    {/* The stale kind the ETL carried over: marked Rented with
                        nothing behind it. Recording its Rental puts it right. */}
                    {option.status === 'rented' && ' · marked Rented, no Rental recorded'}
                  </span>
                </span>
                {chosen?.id === option.id && <Check size={16} aria-hidden className="shrink-0" />}
              </button>
            </li>
          ))}

          {unmatched && (
            <li className="px-3 py-2 text-sm text-muted">
              No Property without an active Rental matches “<span className="text-ink">{query.trim()}</span>”.
              A Property that already has one must have it ended first.
            </li>
          )}
        </ul>
      )}

      {capped && (
        <span className="text-xs text-muted">
          Showing the first {options.length} Properties — if yours is not here, open it from the
          Properties list and use “Rent this Property”
        </span>
      )}
    </div>
  )
}
