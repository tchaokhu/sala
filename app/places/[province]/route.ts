// A province's districts, for the Building form's District picker — one level
// of lib/thai-places.json at a time, so the browser never loads the whole list.
// Public data, built once per province at build time and served as a file.

import { allCodes, districtsOf } from '@/lib/thai-places'

export const dynamic = 'force-static'

export function generateStaticParams() {
  return allCodes().map(({ province }) => ({ province }))
}

export async function GET(_req: Request, { params }: { params: Promise<{ province: string }> }) {
  const list = districtsOf((await params).province)
  return list ? Response.json(list) : new Response('Not a province code', { status: 404 })
}
