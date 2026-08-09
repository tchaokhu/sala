'use client'

// Making an Org, and the person who will run it, in one form.
//
// The two halves are one action rather than two screens because an Org nobody
// can log into is not a useful thing to have made (ADR 0010) — so the first
// admin's address sits here beside the Org's own fields.
//
// The constraints come from lib/org-input.ts, the same module parseCreateOrgForm
// validates against: the browser says what is wrong while the person is still
// looking at the field, and the action says it again for anything that reaches
// it without a browser.

import { Building2 } from 'lucide-react'
import { INPUT, Notice, PRIMARY_BUTTON, useFormAction } from '@/components/form'
import { MAX_ORG_NAME, MAX_SLUG, MIN_SLUG, SLUG_PATTERN } from '@/lib/org-input'
import { createOrg } from './actions'

export function CreateOrgForm() {
  const [result, action, pending] = useFormAction(createOrg)

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <Building2 size={16} aria-hidden />
          Create an Org
        </h2>
        <p className="mt-1 text-sm text-muted">
          The Org and its first Admin arrive together. If that email has no account yet, Sala
          creates one and sends an invitation.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            Agency name<span className="ml-1 text-warn">*</span>
          </span>
          <input
            type="text"
            name="name"
            required
            maxLength={MAX_ORG_NAME}
            disabled={pending}
            placeholder="Bangkok Rentals"
            className={INPUT}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            URL<span className="ml-1 text-warn">*</span>
          </span>
          <input
            type="text"
            name="slug"
            required
            minLength={MIN_SLUG}
            maxLength={MAX_SLUG}
            pattern={SLUG_PATTERN.source}
            disabled={pending}
            placeholder="bkk-rentals"
            className={INPUT + ' font-mono'}
          />
          <span className="text-xs text-muted">
            The <span className="font-mono">/o/…</span> part of every link its Members follow.
            Lowercase letters, digits and single dashes.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            First Admin&apos;s email<span className="ml-1 text-warn">*</span>
          </span>
          <input
            type="email"
            name="email"
            required
            maxLength={254}
            disabled={pending}
            placeholder="somchai@agency.co.th"
            className={INPUT}
          />
          <span className="text-xs text-muted">
            An Admin can add and remove the Org&apos;s other Members.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Display name</span>
          <input
            type="text"
            name="display_name"
            maxLength={80}
            disabled={pending}
            placeholder="Optional — the email shows instead"
            className={INPUT}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? 'Creating…' : 'Create Org'}
        </button>
        <Notice result={result} />
      </div>
    </form>
  )
}
