/**
 * The Sala mark: a two-tiered pavilion roof over three rooms.
 *
 * Tiering is the whole point — a single gable reads as a generic house icon,
 * which is what every other property tool uses. Thai sala roofs stack.
 *
 * At 16px the two tiers collide at the stroke widths that look right at 24px
 * and above, so `compact` spreads them apart and fattens the rooms. Anything
 * below 20px gets `compact`; the browser tab is the place this mark is seen
 * most often, and a smudge there is worse than a slightly different silhouette.
 *
 * `animated` is the loading state (components/SalaLoader.tsx): the two tiers
 * draw in, top first, then the rooms light one by one. The keyframes live in
 * globals.css, so the mark stays a Server Component. Full size only — the
 * compact silhouette is for the tab, which never animates.
 */
export function SalaMark({
  compact = false,
  className,
  animated = false,
  title = 'Sala',
}: {
  compact?: boolean
  animated?: boolean
  className?: string
  title?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label={title}
      fill="none"
    >
      {compact ? (
        <>
          <path
            d="M7.2 6.6 12 2.6l4.8 4"
            stroke="var(--accent)"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M2.2 15.6 12 9.4l9.8 6.2"
            stroke="var(--accent)"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="3.8" y="18.6" width="4.8" height="4.4" rx="0.8" fill="currentColor" />
          <rect x="9.6" y="18.6" width="4.8" height="4.4" rx="0.8" fill="currentColor" />
          <rect x="15.4" y="18.6" width="4.8" height="4.4" rx="0.8" fill="currentColor" />
        </>
      ) : (
        <>
          <path
            className={animated ? 'sala-tier sala-tier-1' : undefined}
            pathLength={animated ? 1 : undefined}
            d="M7.4 8.4 12 4.2l4.6 4.2"
            stroke="var(--accent)"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            className={animated ? 'sala-tier sala-tier-2' : undefined}
            pathLength={animated ? 1 : undefined}
            d="M2.4 14.6 12 8.6l9.6 6"
            stroke="var(--accent)"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect
            className={animated ? 'sala-room sala-room-1' : undefined}
            x="4.2" y="17.4" width="4.4" height="4.4" rx="0.7" fill="currentColor"
          />
          <rect
            className={animated ? 'sala-room sala-room-2' : undefined}
            x="9.8" y="17.4" width="4.4" height="4.4" rx="0.7" fill="currentColor"
          />
          <rect
            className={animated ? 'sala-room sala-room-3' : undefined}
            x="15.4" y="17.4" width="4.4" height="4.4" rx="0.7" fill="currentColor"
          />
        </>
      )}
    </svg>
  )
}
