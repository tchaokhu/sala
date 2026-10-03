'use client'

// A Property's status on the Add and Edit forms, and — only when it is Let
// elsewhere — the date the room is expected back (ADR 0016). Rented is not on
// the list: only creating a Rental sets it (ADR 0009).

import { useState } from 'react'
import { CREATABLE_STATUSES, type CreatableStatus } from '@/lib/property-input'
import type { PropertyStatus } from '@/lib/properties'
import { Field, INPUT } from './form'
import { STATUS_LABELS } from './StatusPill'

export function PropertyStatusField({
  label,
  hint,
  initial,
  initialFreeOn,
  disabled,
}: {
  label: string
  hint: string
  initial: PropertyStatus
  initialFreeOn?: string | null
  disabled?: boolean
}) {
  // A Rented room reached here has no Rental behind it (the form hides this
  // field when it has one): blank posts "no change" until somebody picks.
  const [status, setStatus] = useState<CreatableStatus | ''>(initial === 'rented' ? '' : initial)

  return (
    <>
      <Field label={label} hint={hint}>
        <select
          name="status"
          disabled={disabled}
          value={status}
          onChange={(e) => setStatus(e.target.value as CreatableStatus | '')}
          className={INPUT}
        >
          {initial === 'rented' && <option value="">{STATUS_LABELS.rented}</option>}
          {CREATABLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </Field>

      {status === 'let_elsewhere' && (
        <Field label="Free from" hint="When the other agent's tenant is expected out — optional">
          <input
            type="date"
            name="free_on"
            disabled={disabled}
            defaultValue={initialFreeOn ?? ''}
            className={`${INPUT} tabular`}
          />
        </Field>
      )}
    </>
  )
}
