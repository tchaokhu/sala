// Shapes shared between the console's server reads and its client forms.
//
// Separate from data.ts because that file is `server-only` and importing it from
// a client component — even for a type — is a mistake waiting for someone to
// drop the `type` keyword and turn it into a real import.

export type { ActionResult } from '@/lib/action-result'

export type OrgRole = 'admin' | 'member'

export interface AdminMember {
  user_id: string
  email: string
  display_name: string | null
  role: OrgRole
  created_at: string
}

export interface AdminOrg {
  id: string
  slug: string
  name: string
  member_count: number
  admin_count: number
  created_at: string
  /** Set means the Org is closed to its Members and waiting to be purged
   *  (ADR 0010). Carried on the list row so the console can split active from
   *  pending-deletion without a second query. */
  deleted_at: string | null
  /** Orgs in total, regardless of the limit — so a page can say how many it is
   *  not showing instead of silently ending the list. */
  total: number
}
