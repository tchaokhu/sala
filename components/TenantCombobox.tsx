'use client'

// Picking a Tenant, or typing the name of a new one — BuildingCombobox's shape.
// Posts `tenant_id` when one was chosen off the list and `tenant_name` with
// whatever is in the box; the action prefers the id. Typing again clears the
// id, so "a different one" and "a new one" are the same gesture.

import { useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import type { TenantOption } from '@/lib/tenants'
import { MAX_TENANT_NAME } from '@/lib/rental-input'
import { INPUT } from './form'

export function TenantCombobox({
  options,
  capped,
  disabled,
  onCreatingChange,
}: {
  options: TenantOption[]
  capped: boolean
  disabled?: boolean
  /** True while the box holds a name that was not picked off the list — the
   *  form then asks for the new Tenant's phone, LINE id and note. */
  onCreatingChange?: (creating: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<TenantOption | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => {
    const settled = chosen !== null && query === chosen.name
    const term = settled ? '' : query.trim().toLocaleLowerCase('th')
    const pool = term
      ? options.filter(
          (o) => o.name.toLocaleLowerCase('th').includes(term) || (o.phone ?? '').includes(term),
        )
      : options
    return pool.slice(0, 10)
  }, [options, query, chosen])

  const creating = query.trim().length > 0 && !chosen

  function choose(option: TenantOption) {
    setChosen(option)
    setQuery(option.name)
    setOpen(false)
    onCreatingChange?.(false)
  }

  function retype(value: string) {
    setQuery(value)
    setChosen(null)
    setOpen(true)
    setActive(0)
    onCreatingChange?.(value.trim().length > 0)
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <input type="hidden" name="tenant_id" value={chosen?.id ?? ''} />

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          name="tenant_name"
          role="combobox"
          aria-expanded={open}
          aria-controls="tenant-options"
          aria-autocomplete="list"
          autoComplete="off"
          required
          maxLength={MAX_TENANT_NAME}
          disabled={disabled}
          value={query}
          placeholder="Type to search, or type a new Tenant's name"
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
          aria-label="Show the Tenant list"
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
          id="tenant-options"
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
                  {option.phone && (
                    <span className="tabular block truncate text-xs text-muted">{option.phone}</span>
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
                Will add a new Tenant “<span className="text-ink">{query.trim()}</span>” — pick them
                above instead if they are already on file
              </span>
            </li>
          )}
        </ul>
      )}

      {capped && (
        <span className="text-xs text-muted">
          Showing the first {options.length} Tenants by name — one further down the alphabet will
          not be found here
        </span>
      )}
    </div>
  )
}
