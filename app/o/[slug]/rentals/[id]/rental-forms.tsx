'use client'

// Renew, End and Delete for one Rental. The bounds each form is judged against
// are the row's, read again by the action; what runs here is the preview and
// the count a confirmation names — futureUnpaid, the same predicate end_rental
// deletes by.

import { startTransition, useState } from 'react'
import { RefreshCw, Square, Trash2 } from 'lucide-react'
import { ConfirmAction } from '@/components/ConfirmAction'
import { BUTTON, Card, Field, INPUT, Notice, PRIMARY_BUTTON, useFormAction } from '@/components/form'
import { previewAmount, SchedulePreview } from '@/components/SchedulePreview'
import { buildPaymentSchedule, futureUnpaid } from '@/lib/payments'
import { addDaysIso, isIsoDate } from '@/lib/dates'
import { formatBaht, formatDateThai } from '@/lib/format'
import { defaultEndDate, MAX_END_REASON, REFUND_DUE_DAYS } from '@/lib/rental-input'
import type { RentalStatus } from '@/types'
import { deleteRental, endRental, renewRental } from '../actions'
import { WARN_BUTTON } from '@/components/styles'

interface ManagedRental {
  id: string
  status: RentalStatus
  startDate: string
  endDate: string
  monthlyRent: number
  deposit: number
  commission: number
  rentedByUs: boolean
  rentTrackedByUs: boolean
}

type Unpaid = { due_date: string; settled_date: string | null }

/** React resets a form once its `action=` settles; submitting by hand keeps
 *  what was typed, and the armed confirmation, on screen after a refusal. */
function submitWith(action: (formData: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(() => action(formData))
  }
}

export function RentalManage({
  slug,
  rental,
  payments,
  today,
  deletable,
}: {
  slug: string
  rental: ManagedRental
  payments: Unpaid[]
  /** Bangkok's today, resolved on the server. */
  today: string
  /** Nothing settled, no Rental Document attached. */
  deletable: boolean
}) {
  const active = rental.status === 'active'
  // Always rendered, so the End card's result outlives the re-render that ends
  // the Rental — that message is the only place the deleted count is said.
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        {active && <RenewCard slug={slug} rental={rental} />}
        <EndCard slug={slug} rental={rental} payments={payments} today={today} active={active} />
      </div>
      {deletable && <DeleteCard slug={slug} rental={rental} paymentCount={payments.length} />}
    </div>
  )
}

function RenewCard({ slug, rental }: { slug: string; rental: ManagedRental }) {
  const [result, action, pending] = useFormAction(renewRental)
  const nextStart = addDaysIso(rental.endDate, 1)
  const [end, setEnd] = useState(defaultEndDate(nextStart))
  const [rent, setRent] = useState(String(rental.monthlyRent))
  const [commission, setCommission] = useState(String(rental.commission))

  const schedule =
    isIsoDate(end) && end > rental.endDate
      ? buildPaymentSchedule(
          {
            id: '',
            org_id: '',
            property_id: '',
            start_date: nextStart,
            end_date: end,
            monthly_rent: previewAmount(rent),
            deposit: rental.deposit,
            commission: previewAmount(commission),
            rented_by_us: rental.rentedByUs,
            rent_tracked_by_us: rental.rentTrackedByUs,
          },
          { depositHeld: true },
        )
      : []

  return (
    <Card
      title="Renew"
      note={`This Rental ends on its end date, ${formatDateThai(rental.endDate)}, and the next starts on ${formatDateThai(nextStart)} with the same Tenant. The Deposit stays with the Owner.`}
    >
      <form onSubmit={submitWith(action)} className="flex flex-col gap-4">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="rental_id" value={rental.id} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New end date" required>
            <input
              type="date"
              name="end_date"
              required
              min={nextStart}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              disabled={pending}
              className={`${INPUT} tabular`}
            />
          </Field>
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
          {rental.rentedByUs && (
            <Field label="Commission (THB)" hint="Charged again on a renewal">
              <input
                type="text"
                inputMode="decimal"
                name="commission"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                disabled={pending}
                className={`${INPUT} tabular text-right`}
              />
            </Field>
          )}
        </div>

        <SchedulePreview
          rows={schedule}
          empty={
            isIsoDate(end) && end > rental.endDate
              ? 'No Payments: the rent is not followed and there is no Commission'
              : `Choose a new end date after ${formatDateThai(rental.endDate)} to see the Payments`
          }
        />

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={`${PRIMARY_BUTTON} inline-flex items-center gap-1.5`}>
            <RefreshCw size={14} aria-hidden />
            {pending ? 'Renewing…' : 'Renew Rental'}
          </button>
          <Notice result={result} />
        </div>
      </form>
    </Card>
  )
}

function EndCard({
  slug,
  rental,
  payments,
  today,
  active,
}: {
  slug: string
  rental: ManagedRental
  payments: Unpaid[]
  today: string
  active: boolean
}) {
  const [result, action, pending] = useFormAction(endRental)
  const initialEnd = today
  const [endedOn, setEndedOn] = useState(initialEnd)
  const [refund, setRefund] = useState(String(rental.deposit))
  const [refundDue, setRefundDue] = useState(addDaysIso(initialEnd, REFUND_DUE_DAYS))
  const [armed, setArmed] = useState(false)

  if (!active) return result ? <Notice result={result} /> : null
  // A renewal that has not started yet cannot be ended — ending is today or
  // earlier (parseEndRentalForm). Entered by mistake, it is deleted instead.
  if (today < rental.startDate) {
    return (
      <Card
        title="End Rental"
        note={`This Rental starts on ${formatDateThai(rental.startDate)} and can be ended from that day. If it was entered by mistake, delete it.`}
      >
        {null}
      </Card>
    )
  }

  const dateValid = isIsoDate(endedOn)
  const deleting = dateValid ? futureUnpaid(payments, endedOn).length : 0
  const refundAmount = rental.deposit > 0 ? previewAmount(refund) : 0

  // The refund's due date follows the end date until somebody changes it.
  function changeEndedOn(value: string) {
    if (isIsoDate(endedOn) && refundDue === addDaysIso(endedOn, REFUND_DUE_DAYS) && isIsoDate(value)) {
      setRefundDue(addDaysIso(value, REFUND_DUE_DAYS))
    }
    setEndedOn(value)
  }

  return (
    <Card
      title="End Rental"
      note="For a Tenant leaving early, or a Rental that has run its term. The Property goes back to Available."
    >
      <form onSubmit={submitWith(action)} className="flex flex-col gap-4">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="rental_id" value={rental.id} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="End date" required>
            <input
              type="date"
              name="ended_on"
              required
              min={rental.startDate}
              max={today}
              value={endedOn}
              onChange={(e) => changeEndedOn(e.target.value)}
              disabled={pending}
              className={`${INPUT} tabular`}
            />
          </Field>
          {rental.deposit > 0 && (
            <>
              <Field
                label="Deposit Refund (THB)"
                hint={`Up to the Deposit, ${formatBaht(rental.deposit)}. Lower it for deductions; 0 means none`}
              >
                <input
                  type="text"
                  inputMode="decimal"
                  name="refund"
                  value={refund}
                  onChange={(e) => setRefund(e.target.value)}
                  disabled={pending}
                  className={`${INPUT} tabular text-right`}
                />
              </Field>
              {refundAmount > 0 && (
                <Field label="Refund due" required hint={`${REFUND_DUE_DAYS} days after the end date unless changed`}>
                  <input
                    type="date"
                    name="refund_due"
                    required
                    min={endedOn}
                    value={refundDue}
                    onChange={(e) => setRefundDue(e.target.value)}
                    disabled={pending}
                    className={`${INPUT} tabular`}
                  />
                </Field>
              )}
            </>
          )}
          <Field label="Reason" wide>
            <textarea
              name="reason"
              rows={2}
              maxLength={MAX_END_REASON}
              disabled={pending}
              placeholder="Moved out early, term finished"
              className={INPUT}
            />
          </Field>
        </div>

        {armed ? (
          <div className="flex flex-col gap-2 rounded-lg border border-warn/40 bg-warn/5 p-3">
            <p className="text-sm">
              {dateValid ? (
                <>
                  Ending on <span className="tabular font-semibold">{formatDateThai(endedOn)}</span>{' '}
                  {deleting > 0 ? (
                    <>
                      deletes <span className="tabular font-semibold">{deleting}</span> unpaid{' '}
                      {deleting === 1 ? 'Payment' : 'Payments'} due after it.
                    </>
                  ) : (
                    'deletes no Payments — none unpaid is due after it.'
                  )}{' '}
                  {refundAmount > 0 && isIsoDate(refundDue) && (
                    <>
                      A Deposit Refund of <span className="tabular font-semibold">{formatBaht(refundAmount)}</span>{' '}
                      is followed, due {formatDateThai(refundDue)}.{' '}
                    </>
                  )}
                  The Property goes back to Available.
                </>
              ) : (
                'Choose the end date first.'
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={pending || !dateValid} className={WARN_BUTTON}>
                {pending ? 'Ending…' : 'Confirm end'}
              </button>
              <button type="button" onClick={() => setArmed(false)} className={BUTTON}>
                Cancel
              </button>
              <Notice result={result} />
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setArmed(true)}
              className={`${BUTTON} inline-flex items-center gap-1.5 text-muted hover:text-warn`}
            >
              <Square size={14} aria-hidden />
              End Rental
            </button>
            <Notice result={result} />
          </div>
        )}
      </form>
    </Card>
  )
}

function DeleteCard({
  slug,
  rental,
  paymentCount,
}: {
  slug: string
  rental: ManagedRental
  paymentCount: number
}) {
  return (
    <Card
      title="Delete Rental"
      note="For a Rental entered by mistake. Possible only while none of its Payments is settled and no Rental Document is attached."
    >
      <ConfirmAction
        action={deleteRental}
        fields={{ slug, rental_id: rental.id }}
        trigger={
          <>
            <Trash2 size={14} aria-hidden />
            Delete Rental
          </>
        }
        title="Delete Rental"
      >
        <p>
          {paymentCount > 0 ? (
            <>
              Deletes this Rental and its <span className="tabular font-semibold">{paymentCount}</span>{' '}
              {paymentCount === 1 ? 'Payment' : 'Payments'}. It cannot be recovered.
            </>
          ) : (
            'Deletes this Rental. It has no Payments. It cannot be recovered.'
          )}
        </p>
        {rental.status === 'active' && <p>The Property goes back to Available.</p>}
      </ConfirmAction>
    </Card>
  )
}
