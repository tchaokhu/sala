# Sala

Sala (ศาลา — a public pavilion where people gather) is a shared back-office where
multiple rental agencies each keep their own rooms, tenancies and money. Every
agency's data is walled off from every other agency's; the only thing they share
is the building the software runs in.

## Organisation

**Org**:
A rental agency using Sala. The unit of data ownership — every record in the
system belongs to exactly one Org, and nothing crosses that line.
_Avoid_: Agency, tenant, workspace, account, company

**Membership**:
A person's place inside one Org, carrying a Role. A person may hold several
Memberships across different Orgs.
_Avoid_: Seat, user-org link

**Role**:
What a Member may do inside their Org. Either `owner` (may invite and remove
Members, edit the Org) or `member` (everything else). Roles never restrict which
Properties a person can see — all Members see all of their Org's data. Both may
change their own Display Name and their own login email; neither may change
anyone else's email.
_Avoid_: Permission, access level

**Display Name**:
What a person is called inside one Org. Carried on the Membership, not on the
person, so someone holding Memberships in two Orgs is named separately in each.
Falls back to the login email when unset.
_Avoid_: Full name, username, profile

**Superadmin**:
The operator of Sala, who creates Orgs and invites their first owner. Not a Role
— Superadmin sits outside every Org and is not a Member of any. Reaches Orgs and
Memberships through `/admin` and nothing else: an Org's Properties, Rentals,
Payments, Tenants and Inquiries are closed to the operator too (ADR 0006).
_Avoid_: Platform admin, root, god mode

## Inventory

**Property**:
One rentable thing an Org has on its books — a condo unit, a house or a
townhome. Its name is its Building's name and its room number, put together
rather than typed (ADR 0008).
_Avoid_: Room, unit, listing, asset

**Building**:
The named development a Property sits in, carrying the map pin, the facilities
and the nearby landmarks shared by every Property inside it. Each Org keeps its
own Building records even when two Orgs describe the same real-world building.
A Property with no Building is one the ETL brought in; everything created in
Sala has one.
_Avoid_: Project, condo, development

**Owner**:
The person who owns a Property and entrusts it to the Org. Distinct from the
`owner` Role, which is about Sala itself and has nothing to do with real estate.
_Avoid_: Landlord, lessor

## Tenancy

**Rental**:
An agreement placing one Tenant in one Property for a fixed span, at an agreed
monthly rent. Creating an active Rental is what makes a Property occupied.
_Avoid_: Lease, contract, booking, agreement

**Tenant**:
The person renting a Property. Carries identity documents, so Tenant records are
among the most sensitive data in an Org.
_Avoid_: Renter, occupant, lessee, customer

**Payment**:
One expected sum on one date under one Rental, moving in a stated direction —
money the Org expects to collect, or money it expects to hand back. Payments are
generated up front for the whole Rental term, then settled as money actually
moves. A Payment exists whether or not it has been settled.
_Avoid_: Invoice, transaction, receipt, charge

**Deposit**:
Security money the Tenant hands over at the start of a Rental. The Org holds it
rather than earns it, which is why it comes back out at the end.
_Avoid_: Security, bond, guarantee

**Deposit Refund**:
The Deposit going back to the Tenant when a Rental ends, less whatever the Org
withholds for damage or arrears. The amount is decided at closing, so it is never
part of the schedule generated when the Rental starts.
_Avoid_: Return, payback, reversal

**Commission**:
The Org's cut, owed only when the Org itself brokered the Rental. Never charged
on a Rental the Org merely administers.
_Avoid_: Fee, brokerage

## Leads and paperwork

**Inquiry**:
An unsolicited approach from someone interested in a Property, captured from
outside Sala. Not yet a Tenant and not attached to a Rental.
_Avoid_: Lead, enquiry, contact, request

**Document Template**:
A blank contract or receipt an Org uploads once and reuses, with placeholders
filled in per Rental.
_Avoid_: Form, blank

**Rental Document**:
A finished file attached to one specific Rental — a signed contract, an ID scan,
a transfer slip.
_Avoid_: Attachment, upload, file
