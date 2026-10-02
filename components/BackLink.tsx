// The "Back to the … list" link above a page heading. Without `href` it draws
// the same text unlinked, for a loading.tsx — a loader has no slug to link to,
// and the words land where the page will put them.

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

const SHAPE = 'inline-flex w-fit items-center gap-1.5 text-sm text-muted'

export function BackLink({ href, children }: { href?: string; children: React.ReactNode }) {
  const inner = (
    <>
      <ChevronLeft size={16} aria-hidden />
      {children}
    </>
  )
  if (!href) return <span className={SHAPE}>{inner}</span>
  return (
    <Link href={href} className={`${SHAPE} transition-colors hover:text-ink`}>
      {inner}
    </Link>
  )
}
