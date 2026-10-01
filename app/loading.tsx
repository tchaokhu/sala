import { SalaLoader } from '@/components/SalaLoader'

// The outermost boundary. Every Org page and the console sit behind a layout
// that resolves Membership before rendering anything, and the front door looks
// up which Orgs the session belongs to — none of those know yet which page is
// coming, so there is no shape to draw a skeleton of. Once a gate has passed,
// the nearer loading.tsx files take over with skeletons of the real page.
export default function RootLoading() {
  return <SalaLoader />
}
