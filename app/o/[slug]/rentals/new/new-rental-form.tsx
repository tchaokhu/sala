'use client'

// The add-a-Rental form. The judgement is parseRentalForm's, run by the action;
// what runs here is the schedule preview — the same buildPaymentSchedule and
// settleThrough the action calls, so the line under the money is what gets
// written.

import { startTransition, useState } from 'react'
import { Card, Field, INPUT, Notice, PRIMARY_BUTTON, useFormAction } from '@/components/form'
import { PropertyCombobox } from '@/components/PropertyCombobox'
import { TenantCombobox } from '@/components/TenantCombobox'
import { previewAmount as money, SchedulePreview } from '@/components/SchedulePreview'
import { buildPaymentSchedule, settleThrough } from '@/lib/payments'
import { isIsoDate } from '@/lib/dates'
import {
  defaultEndDate,
  LET_ELSEWHERE_NAME,
  MAX_LINE_ID,
  MAX_TENANT_NOTE,
  MAX_TENANT_PHONE,
  type RentalMode,
} from '@/lib/rental-input'
import type { RentableProperty } from '@/lib/rentals'
import type { TenantOption } from '@/lib/tenants'
import { createRental } from '../actions'

export function NewRentalForm({
  slug,
  today,
  tracksRent,
  properties,
  propertiesCapped,
  initialProperty,
  tenants,
  tenantsCapped,
}: {
  slug: string
  /** Bangkok's today, resolved on the server. */
  today: string
  /** The Org's `tracks_rent` — the default for "We follow the rent". */
  tracksRent: boolean
  properties: RentableProperty[]
  propertiesCapped: boolean
  initialProperty: RentableProperty | null
  tenants: TenantOption[]
  tenantsCapped: boolean
}) {
  const [result, action, pending] = useFormAction(createRental)
  const [mode, setMode] = useState<RentalMode>('ours')
  const [newTenant, setNewTenant] = useState(false)
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(defaultEndDate(today))
  const [paidThrough, setPaidThrough] = useState('')
  const [rent, setRent] = useState(initialProperty ? String(initialProperty.priceMonthly) : '')
  const [deposit, setDeposit] = useState('')
  const [commission, setCommission] = useState('')
  const [rentedByUs, setRentedByUs] = useState(true)
  const [rentTracked, setRentTracked] = useState(tracksRent)

  const ours = mode === 'ours'
  const datesValid = isIsoDate(start) && isIsoDate(end) && end >= start
  const schedule =
    ours && datesValid
      ? settleThrough(
          buildPaymentSchedule({
            id: '',
            org_id: '',
            property_id: '',
            start_date: start,
            end_date: end,
            monthly_rent: money(rent),
            deposit: money(deposit),
            commission: money(commission),
            rented_by_us: rentedByUs,
            rent_tracked_by_us: rentTracked,
          }),
          isIsoDate(paidThrough) ? paidThrough : null,
        )
      : []

  // The end date follows the start until somebody changes it themselves.
  function changeStart(value: string) {
    if (isIsoDate(start) && end === defaultEndDate(start) && isIsoDate(value)) {
      setEnd(defaultEndDate(value))
    }
    setStart(value)
  }

  return (
    // Submitted by hand rather than through `action=`: React resets a form once
    // its action settles, which would un-tick the controlled checkboxes and the
    // mode switch on a failed submit (see PostingChecklist).
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        startTransition(() => action(formData))
      }}
      className="flex flex-col gap-6"
    >
      <input type="hidden" name="slug" value={slug} />

      <Card
        title="Property"
        note={
          ours
            ? 'Only Properties with no active Rental can be picked'
            : 'Recorded only so the room comes back up when it frees — no Tenant, no money, no Payments'
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property" required wide>
            <PropertyCombobox
              options={properties}
              capped={propertiesCapped}
              disabled={pending}
              initial={initialProperty}
              onChoose={(p) => p && setRent(String(p.priceMonthly))}
            />
          </Field>

          <fieldset className="flex flex-col gap-1.5 sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium">Who let it</legend>
            <div className="inline-flex w-fit rounded-lg border border-border bg-bg p-0.5">
              {(
                [
                  ['ours', 'A Rental of ours'],
                  ['elsewhere', LET_ELSEWHERE_NAME],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={
                    'cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors ' +
                    (mode === value ? 'bg-surface font-medium text-ink shadow-sm' : 'text-muted hover:text-ink')
                  }
                >
                  <input
                    type="radio"
                    name="mode"
                    value={value}
                    checked={mode === value}
                    onChange={() => {
                      setMode(value)
                      // The Tenant picker remounts empty when the mode comes back.
                      setNewTenant(false)
                    }}
                    disabled={pending}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </Card>

      {ours && (
        <Card title="Tenant" note="Pick someone already on file, or type a new name to add them">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tenant" required wide>
              <TenantCombobox
                options={tenants}
                capped={tenantsCapped}
                disabled={pending}
                onCreatingChange={setNewTenant}
              />
            </Field>

            {newTenant && (
              <>
                <Field label="Phone" hint="For example 081 234 5678">
                  <input
                    type="tel"
                    name="tenant_phone"
                    maxLength={MAX_TENANT_PHONE}
                    disabled={pending}
                    className={`${INPUT} tabular`}
                  />
                </Field>
                <Field label="LINE id">
                  <input
                    type="text"
                    name="tenant_line_id"
                    maxLength={MAX_LINE_ID}
                    disabled={pending}
                    className={INPUT}
                  />
                </Field>
                <Field label="Note" wide>
                  <textarea
                    name="tenant_note"
                    rows={2}
                    maxLength={MAX_TENANT_NOTE}
                    disabled={pending}
                    className={INPUT}
                  />
                </Field>
              </>
            )}
          </div>
        </Card>
      )}

      <Card
        title="Term"
        note={ours ? undefined : 'The end date can be an estimate — when you learn the real one, delete this Rental and enter it again'}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Start date" required>
            <input
              type="date"
              name="start_date"
              required
              value={start}
              onChange={(e) => changeStart(e.target.value)}
              disabled={pending}
              className={`${INPUT} tabular`}
            />
          </Field>
          <Field label="End date" required hint="Twelve months unless changed">
            <input
              type="date"
              name="end_date"
              required
              min={start}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              disabled={pending}
              className={`${INPUT} tabular`}
            />
          </Field>
          {ours && (
            <Field
              label="Paid through"
              hint="For a tenancy that began before today: everything due on or before this date is recorded as paid. Leave it blank otherwise"
            >
              <input
                type="date"
                name="paid_through"
                min={start}
                max={end}
                value={paidThrough}
                onChange={(e) => setPaidThrough(e.target.value)}
                disabled={pending}
                className={`${INPUT} tabular`}
              />
            </Field>
          )}
        </div>
      </Card>

      {ours && (
        <Card title="Money" note="The Tenant pays the rent and the Deposit to the Owner; the Commission is ours">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Rent per month (THB)" required>
              <input
                type="text"
                inputMode="decimal"
                name="monthly_rent"
                required
                value={rent}
                onChange={(e) => setRent(e.target.value)}
                disabled={pending}
                className={`${INPUT} tabular text-right`}
              />
            </Field>
            <Field label="Deposit (THB)">
              <input
                type="text"
                inputMode="decimal"
                name="deposit"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                disabled={pending}
                placeholder="0"
                className={`${INPUT} tabular text-right`}
              />
            </Field>
            <Field label="Commission (THB)" hint="Only on a Rental we let">
              <input
                type="text"
                inputMode="decimal"
                name="commission"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                disabled={pending}
                placeholder="0"
                className={`${INPUT} tabular text-right`}
              />
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                name="rented_by_us"
                checked={rentedByUs}
                onChange={(e) => setRentedByUs(e.target.checked)}
                disabled={pending}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              We let this room — a Commission is owed to us
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                name="rent_tracked_by_us"
                checked={rentTracked}
                onChange={(e) => setRentTracked(e.target.checked)}
                disabled={pending}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              We follow the rent — a rent Payment each month
            </label>
          </div>
        </Card>
      )}

      <SchedulePreview
        rows={schedule}
        empty={
          !ours
            ? `No Payments: ${LET_ELSEWHERE_NAME.toLowerCase()}`
            : datesValid
              ? 'No Payments: the rent is not followed and there is no Deposit or Commission'
              : 'Set a start date and an end date on or after it to see the Payments'
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? 'Saving…' : 'Save Rental'}
        </button>
        <Notice result={result} />
      </div>
    </form>
  )
}
