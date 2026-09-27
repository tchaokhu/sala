# Agencies differ, and the difference is a column

[0001](./0001-shared-database-with-rls.md) keeps one agency's data out of
another's. [0003](./0003-cozy-keys-becomes-org-one.md) forbids a privileged Org
in the schema, the policies and the UI. Neither says anything about the case
that turns out to matter more once there is a second customer: two agencies with
perfectly separated data that **do the job differently**.

Two differences are already known, from real agencies rather than from
imagination:

1. **Who follows the rent.** Some Orgs chase the monthly rent — they know which
   Tenant is late and it is their job to do something about it. Others take a
   Commission at signing and never look at the monthly money again. Both are
   normal, and one agency may do both, Property by Property.

   This is deliberately not the same question as who *holds* the money. The
   first agency asked about it turned out to take neither extreme: the Tenant
   transfers the monthly rent straight to the Owner, and the agency still
   follows every month and chases a late payer, because following is a service
   it sells. Custody and responsibility come apart, and it is responsibility
   that decides whether a schedule needs to exist.

2. **Whose Property it is.** Some Properties are the Org's own book — an Owner
   entrusted the room to them. Others were found in a public Facebook group and
   are offered without holding anything: no Owner, no mandate, no documents,
   just a room the agency can show a customer today. For a young agency the
   second kind can be most of what it offers.

Each of these is a column. `orgs.tracks_rent` carries the Org's default,
`rentals.rent_tracked_by_us` carries the fact for one tenancy, and
`properties.mandate` is `own` or `sourced`.

Money that really does pass through an Org — a first payment collected and
forwarded to the Owner less commission — is a `direction` on a Payment (`in` /
`out`, 0001), not a second flag on the Rental. A Rental does not need to say
which way money moves; each Payment already does.

## What was rejected

**Branching in code, or a per-deployment setting.** This is the same mistake
0003 forbids, moved from the schema into a config file. The moment one Org's
behaviour is a code path rather than a row, Sala has a privileged Org again —
the one the branch was written for — and every later agency is a special case
argued about in a pull request.

**A separate table for sourced Properties.** The job the Properties list exists
to do is "everything I can show a customer, in one place". Two tables makes that
two queries, two paginations and two search boxes, and the person scanning it
does not care which kind a room is until after they have found it. One table
with a discriminator; the list separates them by default and can search across.

**Generating the rent schedule regardless.** This is the status quo and it is
the worst option. `buildPaymentSchedule` writes a row per month for the whole
term, so an Org that never touches the rent gets twelve meaningless rows per
Rental and a dashboard announcing overdue money it never expected to receive. A
number that is wrong is worse than a number that is absent — it trains people to
ignore the panel that is supposed to be the reason they opened the page.

## Consequences

`buildPaymentSchedule` is called for the rent leg only when
`rent_tracked_by_us` is true. Deposit, Deposit Refund and Commission are
unaffected: those are the Org's business either way, which is why Cozy Keys
built a payment engine at all despite never holding a month's rent.

Every aggregate that counts money — `org_dashboard` (0005), the overdue tiles —
reads only Rentals the Org follows. Getting this wrong does not produce
an error, it produces a plausible wrong number, so it belongs in the SQL and in
a test, not in a convention.

A `sourced` Property has no Owner, enforced by a CHECK rather than by the form,
because the form is not the only writer — the ETL is one too. It may still carry
a Rental: brokering someone else's room is a real deal with a real Commission.
It does not become `own` afterwards. Holding the mandate and closing the deal
are different things, and `rentals.rented_by_us` already records the second.

The Org-level default needs somewhere to live, and `orgs` had no configuration
column before this. It has one now. There is no Org settings page yet — the
Org's own settings screen today is a person's display name and email — so until
one exists the operator sets the flag. That is acceptable while Orgs are created
by hand (0002) and would not be once they are not.

`tracks_rent` defaults to false for a new Org. The two failure modes are not
symmetric: an Org that should follow the rent and does not yet notices on its
first Rental and flips a switch, while an Org that should not and does gets a
year of `payments` rows somebody has to find and delete.

## The rule for the next difference

A column when two real agencies are known to differ. Not before.

This ADR is not a licence to make Sala configurable. There is no plugin system
here, no workflow engine, no per-Org schema and no settings screen full of
switches nobody understands. Every one of those is a way of deferring a decision
forever at the cost of a product that does nothing well. Both flags above exist
because a specific agency was asked and answered differently from Cozy Keys —
that is the bar, and speculation about how some future customer might work is
not it.

## Amended, 2026-08-23

The first difference above was originally written as **who holds the rent**, and
both columns were named for custody: `orgs.collects_rent` and
`rentals.rent_collected_by_us`. Asking the first real agency produced a case the
wording could not hold — the Tenant pays the Owner directly, and the agency still
follows the money every month as a paid service. Read literally, that Rental held
no money, so it would have been given no schedule and no overdue anything, which
is exactly the work being paid for.

The question is now **who follows the rent**, and
`0014_rent_tracked_not_collected.sql` renames both columns to match. No value
changed: every row the ETL set was set by looking for settled rent Payments,
which is evidence of following, not of custody. Nothing else in this decision
changed, and the rule at the end of it is what caught this — the flag existed
because one agency was asked, and asking a second is what corrected it.

## Amended, 2026-09-27

**`direction` is who pays, not custody.** The paragraph above calls it a record
of money that "really does pass through an Org". That is not what the first
agency needs it to mean: rent and the Deposit go from the Tenant straight to the
Owner, and the Owner refunds the Deposit, yet the agency follows all of it. So
`in` is money the agency expects someone to pay — rent and the Deposit by the
Tenant to the Owner, the Commission to the agency — and `out` is money due back
to the Tenant, which today is the Deposit Refund. Who receives it follows from
`type`. No column changed; the sentence did.

**The rent gate is in the code now.** The Consequences above said
`buildPaymentSchedule` writes rent only when `rent_tracked_by_us` is true. It
did not: the flag was not on the `Rental` type and the function had no such
check. It has both now, and a test for each side.

That gate is also what makes the overdue figure in `org_dashboard` read only
followed rent, and it does so by construction rather than by a filter: a rent
Payment is only ever generated for a Rental whose rent is followed, and nothing
changes that flag once a Rental exists (there is no editing a Rental's terms).
The one way round it was data written before the gate — on 2026-09-27 every
Rental on the project with a rent Payment had `rent_tracked_by_us = true`, so
there is none. The sentence above asking for this "in the SQL and in a test"
is met by the gate's test, not by a clause in the dashboard's query; if a
Rental's flag ever becomes editable, that is the day the query needs it.

**A Rental let by another agent is `NOT rented_by_us AND NOT
rent_tracked_by_us`** — no Deposit, no Commission, no schedule. The agency had
no hand in the tenancy and records it only so the room comes back up as it
frees: it is left out of Active Rentals and counted in Ending this month. It has
no column of its own. By this ADR's rule it gets one the day those two flags
stop identifying it unambiguously.
