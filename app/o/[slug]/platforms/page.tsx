// The Platforms page — the places an Org advertises.
//
// This is where the tick-list on the Property form comes from. The count beside
// each row is how many rooms are posted there, counted in Postgres, and it is
// also why the row has no delete button: the database refuses to drop a channel
// with history (0011), so the page offers the thing that actually works.
//
// No search box and no pager, unlike Buildings. `PLATFORMS_LIMIT` sits below one
// page, so both would be controls for scanning a list already on screen.

import { requireMember } from '@/lib/supabase-server'
import { listPlatforms } from '@/lib/platforms'
import { PageHeader } from '@/components/PageHeader'
import { CreatePlatformForm, PlatformRowForms } from './platform-forms'

export default async function PlatformsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const org = await requireMember(slug)
  const platforms = await listPlatforms(org.id)

  const retired = platforms.filter((p) => !p.active).length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Platforms"
        summary="Where this agency advertises. Tick them per room on the Property page."
      />

      <CreatePlatformForm slug={slug} />

      {platforms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="font-semibold">No channels yet</p>
          <p className="mt-1 text-sm text-muted">
            Add the first one above. Until then the Property form has nothing to tick, and no room
            can be marked as posted.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {platforms.map((platform) => (
            <div
              key={platform.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{platform.name}</h3>
                  {!platform.active && (
                    <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted">
                      Retired
                    </span>
                  )}
                </div>
                <p className="tabular text-sm text-muted">
                  {platform.postingCount}{' '}
                  {platform.postingCount === 1 ? 'room posted' : 'rooms posted'}
                </p>
              </div>

              <PlatformRowForms slug={slug} platform={platform} />
            </div>
          ))}
        </div>
      )}

      {retired > 0 && (
        <p className="text-xs text-muted">
          {retired} retired {retired === 1 ? 'channel is' : 'channels are'} hidden from the Property
          form. Everything already posted there still shows it.
        </p>
      )}
    </div>
  )
}
