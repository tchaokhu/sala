# One SECURITY INVOKER function per Rental transition

Creating a Rental writes to four tables: a Tenant when the person is new, the
Rental with its Tenant snapshot, a Payment schedule of up to fourteen rows, and
its Property's status. Ending one updates the Rental, deletes the unpaid
Payments due after the end, adds a Deposit Refund to follow, and frees the
Property. Every write before this went through one PostgREST call from a Server
Action (ADR 0002). Done that way these would be four round-trips in series with
no transaction around them, and a failure after the second leaves a Rental with
no schedule behind a Property that still reads Available — a state nobody chose
and no screen explains.

So each transition is one Postgres function — `create_rental`, `end_rental`,
`renew_rental`, `delete_rental` in `0017_rental_lifecycle.sql` — called once
from its Server Action. The body is one transaction: it all happens or none of
it does.

They are **SECURITY INVOKER**, for the reason ADR 0005 gives for
`org_dashboard`. Running as the caller, every statement inside meets the same
policies a direct write would, and the composite keys from ADR 0013 refuse a
child row naming another Org's parent. Handed another Org's id, the first write
is refused by RLS and the whole call rolls back. The function checks no
Membership itself because it does not need to; the Server Action still
establishes Membership first (ADR 0002), and reads the Property, Tenant or
Rental before the call so that a wrong id becomes a sentence rather than a
constraint name. The keys are the backstop, not the message.

**The schedule is computed in TypeScript and passed in as JSON.**
`buildPaymentSchedule` in `lib/payments.ts` is ported, tested, and runs in the
browser too, where the new-Rental form previews the schedule from the same
function. The function stamps `org_id`, `rental_id` and `property_id` on each
row itself, so the JSON cannot name them.

Refusals come back as their own SQLSTATEs (`P0002` not found or not active,
`SL001` a settled Payment, `SL002` a Rental Document), so the action tells them
apart without reading Postgres text.

## Rejected

- **Sequential PostgREST writes from the action.** No transaction. A
  compensating delete on failure is a second write that can fail too, and a
  crash between the two has nobody to run it.
- **SECURITY DEFINER.** It would make the function the only thing between a
  caller and every Org's books, and it would look exactly like the invoker
  version in the source (ADR 0005). Nothing here needs rights the caller lacks.
- **The schedule in plpgsql.** A second implementation of rules that already
  exist, are tested, and have to run in the browser for the preview. The two
  would drift, and the preview would stop matching what was written.

## Consequences

A transition that touches more than one row is a function in a migration, not
a chain of calls in an action. Each needs the explicit
`REVOKE ALL ... FROM PUBLIC, anon, authenticated` and `GRANT EXECUTE ... TO
authenticated` (CLAUDE.md), and `tests/rls/schema-shape.test.ts` fails if anon
can call one.

The JSON the action sends is trusted for its shape, not its rights: the rows
still meet `payments`' CHECKs and policies, so a malformed schedule fails the
whole call rather than writing half of it.
