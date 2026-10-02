// A district's subdistricts with their postcodes, for the Building form's
// Subdistrict picker. See ../route.ts.

import { allCodes, subdistrictsOf } from '@/lib/thai-places'

export const dynamic = 'force-static'

export function generateStaticParams() {
  return allCodes().flatMap(({ province, district }) => district.map((d) => ({ province, district: d })))
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ province: string; district: string }> },
) {
  const { province, district } = await params
  const list = district.startsWith(province) ? subdistrictsOf(district) : null
  return list ? Response.json(list) : new Response('Not a district code', { status: 404 })
}
