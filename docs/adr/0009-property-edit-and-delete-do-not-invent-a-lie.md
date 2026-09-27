# Property delete stays RESTRICT-blocked, and edit locks status once a Rental is real

Property gets edit and delete for the first time. Buildings already have both, and
the obvious move was to copy that pattern — `requireMember`, an `org_id`-filtered
`.update()` or `.delete()`, a two-click confirm on delete. Most of it copies
cleanly. Two places it does not, and both come from the same instinct that shaped
`lib/property-input.ts` already: **nothing in this feature may write a claim about
a Rental that isn't backed by one.**

**Delete is a real `DELETE`, and it stays blocked rather than growing an archive.**
`buildings.id` is referenced `ON DELETE SET NULL`, so `deleteBuilding` always
succeeds — the Properties inside survive with the link cleared. `properties.id` is
referenced `ON DELETE RESTRICT` from both `rentals` and `payments`, so a Property
that has ever carried a Rental or a Payment cannot be removed; Postgres refuses it.
The UI surfaces that refusal in Thai rather than translating it into a generic
failure. The alternative — a soft-delete or archive column so a Property with
history could still be hidden from the active list — was rejected for now: it is a
domain concept CONTEXT.md does not have, Sala has no other soft-delete pattern
anywhere to be consistent with, and nobody has asked for it yet. This is easy to
revisit the day a Property genuinely needs to disappear from view without losing
the Rentals and Payments under it — it just isn't today's problem.

**Edit cannot set or clear `rented`.** `CREATABLE_STATUSES` already excludes
`rented` at creation for a stated reason: a status claiming a tenant with no
Rental behind it is a lie the list cannot correct. Edit answers to the same
constraint from the other side — a Property already sitting at `rented` (today,
only ETL-imported rows) shows status as read-only, because there is still no
Rental-management flow in the product that could make the claim true or end it.
When that flow exists, status transitions belong to it, not to this form. Between
`available` and `reserved`, both directions stay freely editable, same as create.

## Consequences

Photo removal on edit mirrors ADR 0007's ordering, applied in reverse. Create
uploads objects before the row references them, so the row can never point at
bytes that never arrived. Edit updates the row to drop a reference *before*
deleting the object, so a live row can never point at bytes that are already
gone; the reverse ordering (object survives one beat past the row) fails safe the
same way ADR 0007's does — an orphaned object nothing references is swept
best-effort and costs storage, not correctness.

Property delete follows the same order for the same reason: the row is deleted
first, and only on success are its Storage objects swept. A delete blocked by
`ON DELETE RESTRICT` therefore never touches Storage at all.

## Amended, 2026-09-27

The status lock above was written for a product with no Rental-management
flow, and read "a Property at `rented` shows status as read-only". That flow
exists now (ADR 0014), and the transitions belong to it as this ADR said they
would: creating a Rental sets its Property `rented`, ending or deleting one sets
it `available`, and renewing leaves it `rented`.

The lock is now **"an active Rental exists"**, not "status is `rented`". The
difference matters because thirteen Properties came across from Cozy Keys at
`rented` with no Rental behind them — let through the agency but never recorded,
let by another agent, or simply stale. Under the old wording none of them could
be put right. Now a stale one can be set back to Available from its edit form,
and one that really is let can be recorded as a Rental. Edit still cannot *set*
`rented`; only creating a Rental does. `getPropertyForEdit` reads the active
Rental alongside the row, and `parsePropertyEditForm` locks on that.

Delete is unchanged. An ended Rental still references its Property, so ending
it does not make the Property deletable; a Rental entered by mistake can itself
be deleted while nothing under it is settled, and then the Property can go.
