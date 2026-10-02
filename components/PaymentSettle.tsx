'use client'

// Settle and Correct for one Payment row — the Payments list and the Rental
// page both draw it (one component, two callers), in the app's one Dialog.
//
// The action reads the Payment again under the Org and judges the form against
// that row; what arrives here is only for the defaults and the sentence that
// says what is already in.

import { startTransition, useEffect, useState } from 'react'
import { Dialog } from '@/components/Dialog'
import { HandCoins, Pencil, Trash2 } from 'lucide-react'
import { BUTTON, Field, INPUT, Notice, PRIMARY_BUTTON, useFormAction } from '@/components/form'
import { formatBaht, formatDateThai } from '@/lib/format'
import { MAX_PAYMENT_NOTE, PAYMENT_METHODS } from '@/lib/payment-input'
import type { ActionResult } from '@/lib/action-result'
import type { RentalPayment } from '@/lib/rentals'
import { clearSettlement, correctSettlement, settlePayment } from '@/app/o/[slug]/payments/actions'
import { PAYMENT_METHOD_LABELS } from './StatusPill'
import { WARN_BUTTON } from '@/components/styles'
import { PANEL, ROW_LINK } from './styles'

export type SettleablePayment = Pick<
  RentalPayment,
  'id' | 'amount' | 'settled_amount' | 'settled_date' | 'method' | 'note'
> & { outstanding: number }

type Mode = 'settle' | 'correct'

/** React resets a form once its `action=` settles; submitting by hand keeps
 *  what was typed on screen after a refusal. */
function submitWith(action: (formData: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(() => action(formData))
  }
}

export function PaymentSettle({
  slug,
  payment,
  today,
  title,
}: {
  slug: string
  payment: SettleablePayment
  /** Bangkok's today, resolved on the server. */
  today: string
  /** What the Payment is, for the dialog's heading — "Rent due 5 Oct 2026". */
  title: string
}) {
  const [mode, setMode] = useState<Mode | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState<ActionResult | null>(null)

  function open(next: Mode) {
    setDone(null)
    setMode(next)
  }

  function finished(result: ActionResult) {
    setPending(false)
    setDone(result)
    setMode(null)
  }

  const recorded = (payment.settled_amount ?? 0) > 0

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {done && <Notice result={done} />}
      {payment.outstanding > 0 && (
        <button type="button" onClick={() => open('settle')} className={ROW_LINK}>
          <HandCoins size={14} aria-hidden />
          Settle
        </button>
      )}
      {recorded && (
        <button type="button" onClick={() => open('correct')} className={ROW_LINK}>
          <Pencil size={14} aria-hidden />
          Correct
        </button>
      )}

      <Dialog
        open={mode !== null}
        onClose={() => setMode(null)}
        label={`${mode === 'settle' ? 'Settle' : 'Correct'} ${title}`}
        busy={pending}
      >
        {mode && (
          <div className={`pointer-events-auto flex w-full max-w-md flex-col gap-4 ${PANEL}`}>
            <div>
              <h2 className="font-semibold">
                {mode === 'settle' ? 'Settle' : 'Correct'} {title}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {mode === 'settle' ? (
                  recorded ? (
                    <>
                      <span className="tabular">{formatBaht(payment.settled_amount)}</span> of{' '}
                      <span className="tabular">{formatBaht(payment.amount)}</span> settled;{' '}
                      <span className="tabular font-semibold text-ink">{formatBaht(payment.outstanding)}</span> to
                      go.
                    </>
                  ) : (
                    <>
                      <span className="tabular font-semibold text-ink">{formatBaht(payment.amount)}</span> owed.
                    </>
                  )
                ) : (
                  <>
                    What was recorded, to edit directly. The amount is the total settled so far, up to{' '}
                    <span className="tabular">{formatBaht(payment.amount)}</span>.
                  </>
                )}
              </p>
            </div>
            <SettlementForm
              key={mode}
              mode={mode}
              slug={slug}
              payment={payment}
              today={today}
              onPending={setPending}
              onDone={finished}
              onCancel={() => setMode(null)}
            />
            {mode === 'correct' && (
              <ClearSettlement slug={slug} payment={payment} onPending={setPending} onDone={finished} />
            )}
          </div>
        )}
      </Dialog>
    </div>
  )
}

function SettlementForm({
  mode,
  slug,
  payment,
  today,
  onPending,
  onDone,
  onCancel,
}: {
  mode: Mode
  slug: string
  payment: SettleablePayment
  today: string
  onPending: (pending: boolean) => void
  onDone: (result: ActionResult) => void
  onCancel: () => void
}) {
  const settling = mode === 'settle'
  const [result, action, pending] = useFormAction(async (formData) => {
    const r = await (settling ? settlePayment : correctSettlement)(formData)
    if (r.ok) onDone(r)
    return r
  })
  useEffect(() => onPending(pending), [pending, onPending])

  const [amount, setAmount] = useState(String(settling ? payment.outstanding : (payment.settled_amount ?? 0)))
  const [date, setDate] = useState(settling ? today : (payment.settled_date ?? today))
  const [method, setMethod] = useState(payment.method ?? 'transfer')
  const [note, setNote] = useState(payment.note ?? '')

  return (
    <form onSubmit={submitWith(action)} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="payment_id" value={payment.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={settling ? 'Amount received (THB)' : 'Amount settled (THB)'} required>
          <input
            type="text"
            inputMode="decimal"
            name="amount"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={pending}
            className={`${INPUT} tabular text-right`}
          />
        </Field>
        <Field label={settling ? 'Received on' : 'Settled on'} required>
          <input
            type="date"
            name="settled_date"
            required
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={pending}
            className={`${INPUT} tabular`}
          />
        </Field>
        <Field label="Method" required>
          <select
            name="method"
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
            disabled={pending}
            className={INPUT}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note" wide>
          <textarea
            name="note"
            rows={2}
            maxLength={MAX_PAYMENT_NOTE}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={pending}
            placeholder={settling ? 'Paid in two transfers' : undefined}
            className={INPUT}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {settling ? (pending ? 'Recording…' : 'Record payment') : pending ? 'Saving…' : 'Save correction'}
        </button>
        <button type="button" disabled={pending} onClick={onCancel} className={BUTTON}>
          Cancel
        </button>
        <Notice result={result} />
      </div>
    </form>
  )
}

function ClearSettlement({
  slug,
  payment,
  onPending,
  onDone,
}: {
  slug: string
  payment: SettleablePayment
  onPending: (pending: boolean) => void
  onDone: (result: ActionResult) => void
}) {
  const [armed, setArmed] = useState(false)
  const [result, action, pending] = useFormAction(async (formData) => {
    const r = await clearSettlement(formData)
    if (r.ok) onDone(r)
    return r
  })
  useEffect(() => onPending(pending), [pending, onPending])

  if (!armed) {
    return (
      <div className="border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-warn"
        >
          <Trash2 size={14} aria-hidden />
          Clear this settlement
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={submitWith(action)}
      className="flex flex-col gap-2 rounded-lg border border-warn/40 bg-warn/5 p-3"
    >
      <p className="text-sm">
        Clears <span className="tabular font-semibold">{formatBaht(payment.settled_amount)}</span> recorded on{' '}
        <span className="tabular font-semibold">{formatDateThai(payment.settled_date)}</span>. The whole{' '}
        <span className="tabular">{formatBaht(payment.amount)}</span> is owed again; the note stays.
      </p>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="payment_id" value={payment.id} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={WARN_BUTTON}>
          {pending ? 'Clearing…' : 'Confirm clear'}
        </button>
        <button type="button" disabled={pending} onClick={() => setArmed(false)} className={BUTTON}>
          Cancel
        </button>
        <Notice result={result} />
      </div>
    </form>
  )
}
