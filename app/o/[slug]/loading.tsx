// Shown while the aggregate query runs. Skeletons, not spinners, for content
// whose shape is known — and the shape is literally the same component, so the
// numbers land without moving anything (CLAUDE.md).

import { StatTileSkeleton } from '@/components/StatTile'
import { PageHeader } from '@/components/PageHeader'
import { TILE_LABELS } from './tiles'

export default function OrgHomeLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Overview" summary="The summary before the detail" />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {TILE_LABELS.map((label) => (
          <StatTileSkeleton key={label} label={label} />
        ))}
      </section>
    </div>
  )
}
