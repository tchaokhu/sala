// Domain types. The vocabulary here is defined in CONTEXT.md — when a name
// changes in one, change it in the other.
//
// Every record that belongs to an Org carries `org_id`. It is not optional and
// it never arrives from the client (ADR 0002).

export interface Org {
  id: string
  slug: string
  name: string
  created_at: string
  /** Set means soft-deleted: closed to its Members now, purged after the
   *  recovery window (ADR 0010). Only the service role ever sees a row with
   *  this set — is_member() refuses everyone else. */
  deleted_at?: string | null
}

export type Role = 'admin' | 'member'

export interface Membership {
  org_id: string
  user_id: string
  role: Role
  created_at: string
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export type PropertyType = 'condo' | 'house' | 'townhome'
export type PropertyStatus = 'available' | 'reserved' | 'rented'

export interface Building {
  id: string
  org_id: string
  name: string
  name_en?: string
  district: string
  province: string
  google_map_url?: string
  facilities: string[]
  nearby: string[]
  created_at: string
}

export interface Owner {
  id: string
  org_id: string
  name: string
  phone: string
  email?: string
  line_id?: string
  note?: string
  source?: string
  created_at: string
}

export interface Property {
  id: string
  org_id: string
  title: string
  title_en?: string
  description?: string
  price_monthly: number
  property_type: PropertyType
  bedrooms: number
  bathrooms: number
  area_sqm: number
  floor?: number
  room_number?: string
  location: string
  district: string
  province: string
  status: PropertyStatus
  images: string[]
  contact_line?: string
  owner_id?: string
  building_id?: string
  created_at: string
  updated_at: string
}

// ─── Tenancy ─────────────────────────────────────────────────────────────────

export interface Tenant {
  id: string
  org_id: string
  name: string
  phone?: string
  email?: string
  line_id?: string
  /** Identity document. Never log, never put in an error message. */
  id_card?: string
  address?: string
  emergency_contact?: string
  note?: string
  created_at: string
  updated_at: string
}

export type RentalStatus = 'active' | 'ended' | 'cancelled'

export interface Rental {
  id: string
  org_id: string
  property_id: string
  tenant_id?: string
  tenant_name_snapshot: string
  tenant_phone_snapshot?: string
  start_date: string
  end_date: string
  monthly_rent: number
  deposit: number
  commission: number
  rented_by_us: boolean
  /** Whether the Org follows this tenancy's monthly rent — what decides if a
   *  rent schedule exists at all (ADR 0011). Not custody. */
  rent_tracked_by_us: boolean
  status: RentalStatus
  ended_at?: string
  ended_reason?: string
  note?: string
  created_at: string
  updated_at: string
}

// ─── Money ───────────────────────────────────────────────────────────────────

/** Which way the money moves. Cozy Keys assumed every Payment was incoming,
 *  which left deposit refunds with nowhere to live. */
export type PaymentDirection = 'in' | 'out'

export type PaymentType =
  | 'rent'
  | 'deposit'
  | 'commission'
  | 'deposit_refund'
  | 'other'

export type PaymentMethod = 'cash' | 'transfer' | 'other'
export type PaymentStatus = 'settled' | 'partial' | 'overdue' | 'pending'

export interface Payment {
  id: string
  org_id: string
  rental_id: string
  property_id: string
  direction: PaymentDirection
  type: PaymentType
  due_date: string
  amount: number
  settled_date?: string
  settled_amount?: number
  method?: PaymentMethod
  note?: string
  created_at: string
  updated_at: string
}

// ─── Leads and paperwork ─────────────────────────────────────────────────────

export type InquiryStatus = 'new' | 'contacted' | 'closed'

export interface Inquiry {
  id: string
  org_id: string
  property_id?: string
  name: string
  phone: string
  email?: string
  message?: string
  preferred_date?: string
  status: InquiryStatus
  created_at: string
}

export type DocumentTemplateCategory =
  | 'rental_contract'
  | 'agency_contract'
  | 'receipt'
  | 'other'

export interface DocumentTemplate {
  id: string
  org_id: string
  category: DocumentTemplateCategory
  title: string
  description?: string
  storage_path: string
  file_name: string
  size_bytes: number
  uploaded_by?: string
  created_at: string
  updated_at: string
}

export interface RentalDocument {
  id: string
  org_id: string
  rental_id: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  uploaded_by?: string
  created_at: string
}
