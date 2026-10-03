# A room let by another agent is a Property status, not a Rental

ADR 0011 recorded a room let by another agent as a Rental with no money on it —
`NOT rented_by_us AND NOT rent_tracked_by_us`, a placeholder Tenant, an end date
— so the room would come back up as it freed and count in Ending this month. In
use the agency does not want to keep a contract it was never party to: it only
needs to know the room is not on offer. None had been recorded in Sala; the
thirteen Properties that came from Cozy Keys at `rented` with no Rental behind
them (ADR 0009, amended) were the real cases, mixed with stale ones.

So the room is marked on the Property instead (user, 2026-10-03):

- **`let_elsewhere` is a fourth `property_status`.** `rented` keeps meaning "an
  active Rental of ours exists" (ADR 0009) — only creating a Rental sets it.
  `let_elsewhere` is set and cleared freely from the Property form, at Add and
  at Edit, like `available` and `reserved`. A room let elsewhere can still be
  let by us: creating a Rental moves it to `rented`.
- **`free_on` is an optional expected date** the room comes back, shown beside
  the status. Nothing acts on it — the room stays let elsewhere until a person
  sets it back. It exists only while the status is `let_elsewhere`: a trigger
  clears it when the status moves off, which covers every writer including
  `create_rental`, and a CHECK holds the same rule.
- **The thirteen** `rented` Properties with no active Rental move to
  `let_elsewhere` in the same migration. One that was really let by us is put
  right by recording its Rental.
- **Add Rental loses "Let by another agent".** A Rental is ours: it is refused
  when both `rented_by_us` and `rent_tracked_by_us` are off, the pair that
  meant "let elsewhere" under ADR 0011, and the form points to the Property
  instead. The two columns stay — each still means what ADR 0011 says for a
  Rental of ours.

Rejected: letting the Property form set `rented` without a Rental (`rented`
would stop telling a Rental of ours from someone else's); reusing `reserved`
(that is a customer holding the room with us); keeping the option in Add Rental
but writing the Property (a button in Rentals that makes no Rental).

`org_rental_counts` still returns a `let_elsewhere` count; it is always zero and
nothing reads it. It goes the next time that function changes for a reason of
its own.
