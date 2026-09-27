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
What a Member may do inside their Org. Either `admin` (may invite and remove
Members, edit the Org) or `member` (everything else). Roles never restrict which
Properties a person can see — all Members see all of their Org's data. Both may
change their own Display Name and their own login email; neither may change
anyone else's email.
_Avoid_: Permission, access level, owner

**Display Name**:
What a person is called inside one Org. Carried on the Membership, not on the
person, so someone holding Memberships in two Orgs is named separately in each.
Falls back to the login email when unset.
_Avoid_: Full name, username, profile

**Superadmin**:
The operator of Sala, who creates Orgs and invites their first admin. Not a Role
— Superadmin sits outside every Org and is not a Member of any. Reaches Orgs and
Memberships through `/admin` and nothing else: an Org's Properties, Rentals,
Payments, Tenants and Inquiries are closed to the operator too (ADR 0006).
Also the only one who can remove an Org, and the only one who can put it back:
removal is soft, closing the Org to its Members at once and leaving it
restorable for sixty days before it is purged for good (ADR 0010).
_Avoid_: Platform admin, root, god mode

## Inventory

**Property**:
One rentable thing an Org can offer — a condo unit, a house or a townhome —
whether it sits on the Org's own books or was found elsewhere and can be shown
without holding it. Which of the two it is, is its Mandate. Its name is its
Building's name and its room number, put together rather than typed (ADR 0008).
_Avoid_: Room, unit, listing, asset

**Mandate**:
Whether a Property is the Org's own or merely one it can offer. `own` means an
Owner entrusted the room to the Org. `sourced` means the Org found it in a
public group or through another agent and holds nothing — a sourced Property
never has an Owner. Letting one does not make it own: brokering someone else's
room is an ordinary Rental, and it is `rented_by_us` that records who closed it
(ADR 0011).
_Avoid_: Ownership, source, listing type

**Building**:
The named development a Property sits in, carrying the map pin, the facilities
and the nearby landmarks shared by every Property inside it. Each Org keeps its
own Building records even when two Orgs describe the same real-world building.
A Property with no Building is one the ETL brought in; everything created in
Sala has one.
_Avoid_: Project, condo, development

**Owner**:
The person who owns a Property and entrusts it to the Org. Always the real-estate
sense — the Role that used to share this word is now `admin` (ADR 0010).
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
moves. A Payment exists whether or not it has been settled. The monthly rent is
only among them where the Org follows the rent for that Rental — which is not
the same as holding it, since an Org can chase rent the Tenant pays straight to
the Owner. Where nobody follows it, the schedule is the Deposit and the
Commission alone (ADR 0011).
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

**Platform**:
A place an Org advertises its Properties — Facebook, Livinginsider, a LINE
group. Each Org keeps its own list the way it keeps its own Buildings, even when
two Orgs name the same site. A Platform an Org stops using goes inactive rather
than away, so the Postings that already name it still read.
_Avoid_: Channel, site, portal, marketplace

**Posting**:
The fact that one Property is advertised on one Platform, with the link when
there is one. A Posting exists only where the advertisement does — a Property
with no Posting is one nobody is currently marketing, which is what the
Properties list is scanned for.
_Avoid_: Listing, ad, post, publication

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
