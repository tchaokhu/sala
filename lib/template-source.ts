// What filling a Document Template reads (ADR 0017): the template's own bytes,
// and the facts a Rental or a Property gives the tags. Server-only — the
// Tenant's ID number travels from here to the fill form and nowhere else, and
// nothing here logs it.

import 'server-only'
import { createClient } from './supabase-server'
import { DOCS_BUCKET } from './rental-documents'
import { embeddedOne } from './properties'
import type { TagSource } from './template-tags'

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export interface TemplateFile {
  id: string
  title: string
  fileName: string
  bytes: Uint8Array
}

/** A DOCX template of this Org with its bytes, or null — another Org's, a
 *  missing one and a PDF are all null: none of them can be filled. */
export async function getTemplateFile(orgId: string, templateId: string): Promise<TemplateFile | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('document_templates')
    .select('id, title, file_name, storage_path')
    .eq('id', templateId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  const row = data as { id: string; title: string; file_name: string; storage_path: string } | null
  if (!row || !row.storage_path.endsWith('.docx')) return null

  const { data: blob, error: downloadError } = await supabase.storage.from(DOCS_BUCKET).download(row.storage_path)
  if (downloadError) throw downloadError
  if (blob.type && blob.type !== DOCX && blob.type !== 'application/octet-stream') return null
  return { id: row.id, title: row.title, fileName: row.file_name, bytes: new Uint8Array(await blob.arrayBuffer()) }
}

export interface FillChoice {
  id: string
  title: string
  roomNumber: string | null
  /** The Tenant of its active Rental, which filling from it uses. */
  tenantName: string | null
}

export const FILL_CHOICES_LIMIT = 500

/** Properties to fill from, each with the Tenant of its active Rental. The
 *  embed filter narrows the Rentals, not the Properties. */
export async function listFillChoices(orgId: string): Promise<{ choices: FillChoice[]; capped: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('properties')
    .select('id, title, room_number, rentals(tenant_name_snapshot)')
    .eq('org_id', orgId)
    .eq('rentals.status', 'active')
    .order('title')
    .limit(FILL_CHOICES_LIMIT)
  if (error) throw error
  const rows = (data ?? []) as { id: string; title: string; room_number: string | null; rentals: { tenant_name_snapshot: string }[] | null }[]
  return {
    choices: rows.map((p) => ({ id: p.id, title: p.title, roomNumber: p.room_number, tenantName: p.rentals?.[0]?.tenant_name_snapshot ?? null })),
    capped: rows.length === FILL_CHOICES_LIMIT,
  }
}

type One<T> = T | T[] | null

interface PropertyRecord {
  id: string
  title: string
  room_number: string | null
  floor: number | null
  buildings: One<{
    name: string
    name_en: string | null
    subdistrict: string
    district: string
    province: string
    postcode: string
  }>
  owners: One<{ name: string; phone: string | null }>
}

const PROPERTY_COLUMNS =
  'id, title, room_number, floor, ' +
  'buildings(name, name_en, subdistrict, district, province, postcode), owners(name, phone)'

function propertyFacts(p: PropertyRecord): Pick<TagSource, 'property' | 'building' | 'owner'> {
  const b = embeddedOne(p.buildings)
  const o = embeddedOne(p.owners)
  return {
    property: { title: p.title, roomNumber: p.room_number, floor: p.floor },
    building: b && {
      name: b.name,
      nameEn: b.name_en,
      subdistrict: b.subdistrict,
      district: b.district,
      province: b.province,
      postcode: b.postcode,
    },
    owner: o && { name: o.name, phone: o.phone },
  }
}

export type Facts = Omit<TagSource, 'today' | 'orgName'> & { propertyId: string }

/** Everything a Rental gives: its term and money, its Tenant (the record if
 *  it still exists, the snapshot if not), its Property, Building and Owner. */
export async function factsFromRental(orgId: string, rentalId: string): Promise<Facts | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rentals')
    .select(
      'start_date, end_date, monthly_rent, deposit, tenant_name_snapshot, tenant_phone_snapshot, ' +
        'tenants(name, phone, id_card, address, emergency_contact), ' +
        `properties(${PROPERTY_COLUMNS})`,
    )
    .eq('id', rentalId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const r = data as unknown as {
    start_date: string
    end_date: string
    monthly_rent: number
    deposit: number
    tenant_name_snapshot: string
    tenant_phone_snapshot: string | null
    tenants: One<{ name: string; phone: string | null; id_card: string | null; address: string | null; emergency_contact: string | null }>
    properties: One<PropertyRecord>
  }
  const t = embeddedOne(r.tenants)
  const p = embeddedOne(r.properties)!
  return {
    propertyId: p.id,
    rental: { startDate: r.start_date, endDate: r.end_date, monthlyRent: Number(r.monthly_rent), deposit: Number(r.deposit) },
    tenant: t
      ? { name: t.name, phone: t.phone, idCard: t.id_card, address: t.address, emergencyContact: t.emergency_contact }
      : { name: r.tenant_name_snapshot, phone: r.tenant_phone_snapshot, idCard: null, address: null, emergencyContact: null },
    ...propertyFacts(p),
  }
}

/** A Property's facts — and, when it has an active Rental, that Rental's,
 *  which is what a contract for the room is about. Two round-trips only then:
 *  the second needs the Rental's id from the first. */
export async function factsFromProperty(orgId: string, propertyId: string): Promise<Facts | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('properties')
    .select(`${PROPERTY_COLUMNS}, rentals(id)`)
    .eq('id', propertyId)
    .eq('org_id', orgId)
    .eq('rentals.status', 'active')
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const p = data as unknown as PropertyRecord & { rentals: { id: string }[] | null }
  const active = p.rentals?.[0]?.id
  if (active) return factsFromRental(orgId, active)
  return { propertyId: p.id, ...propertyFacts(p) }
}
