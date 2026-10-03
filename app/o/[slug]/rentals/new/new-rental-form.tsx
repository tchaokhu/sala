'use client'

// The add-a-Rental form. The judgement is parseRentalForm's, run by the action;
// what runs here is the schedule preview — the same buildPaymentSchedule and
// settleThrough the action calls, so the line under the money is what gets
// written.

import { startTransition, useState } from 'react'
import Link from 'next/link'
import { Card, Field, INPUT, Notice, PRIMARY_BUTTON, useFormAction } from '@/components/form'
import { PropertyCombobox } from '@/components/PropertyCombobox'
import { TenantCombobox } from '@/components/TenantCombobox'
import { previewAmount as money, SchedulePreview } from '@/components/SchedulePreview'
import { buildPaymentSchedule, settleThrough } from '@/lib/payments'
import { isIsoDate } from '@/lib/dates'
import {
  defaultEndDate,
  MAX_LINE_ID,
  MAX_TENANT_NOTE,
  MAX_TENANT_PHONE,
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
  const [chosenId, setChosenId] = useState<string | null>(initialProperty?.id ?? null)
  const [newTenant, setNewTenant] = useState(false)
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(defaultEndDate(today))
  const [paidThrough, setPaidThrough] = useState('')
  const [rent, setRent] = useState(initialProperty ? String(initialProperty.priceMonthly) : '')
  const [deposit, setDeposit] = useState('')
  const [commission, setCommission] = useState('')
  const [rentedByUs, setRentedByUs] = useState(true)
  const [rentTracked, setRentTracked] = useState(tracksRent)

  const datesValid = isIsoDate(start) && isIsoDate(end) && end >= start
  const schedule =
    datesValid
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
    // its action settles, which would un-tick the controlled checkboxes on a
    // failed submit (see PostingChecklist).
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        startTransition(() => action(formData))
      }}
      className="flex flex-col gap-6"
    >
      <input type="hidden" name="slug" value={slug} />

      <Card title="Property" note="Only Properties with no active Rental can be picked">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property" required wide>
            <PropertyCombobox
              options={properties}
              capped={propertiesCapped}
              disabled={pending}
              initial={initialProperty}
              onChoose={(p) => {
                setChosenId(p?.id ?? null)
                if (p) setRent(String(p.priceMonthly))
              }}
            />
          </Field>

          {/* A room another agent let is not a Rental of ours: it is marked on the
              Property (ADR 0016). */}
          <p className="text-sm text-muted sm:col-span-2">
            Let by another agent? Mark the Property{' '}
            <Link
              href={chosenId ? `/o/${slug}/properties/${chosenId}?edit=1` : `/o/${slug}/properties`}
              className="text-accent underline-offset-4 hover:underline"
            >
              Let elsewhere
            </Link>{' '}
            instead — no Rental needed.
          </p>
        </div>
      </Card>

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

      <Card title="Term">
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
        </div>
      </Card>

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
          {!rentedByUs && !rentTracked && (
            <p role="status" className="text-sm text-warn">
              Neither ticked means another agent&apos;s tenancy — mark the Property Let elsewhere instead
            </p>
          )}
        </div>
      </Card>

      <SchedulePreview
        rows={schedule}
        empty={
          datesValid
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
