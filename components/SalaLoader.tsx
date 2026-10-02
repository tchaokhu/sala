import { SalaMark } from './SalaMark'

/**
 * The branded wait: the Sala mark building itself, centred in whatever space
 * it is given. For waits whose shape is not known yet — the front door choosing
 * an Org, the Org and console gates resolving Membership before any page can
 * render. A page whose shape is known keeps its own skeleton (CLAUDE.md); this
 * is never a substitute for one.
 *
 * It fades in after a beat, so a gate that resolves quickly shows nothing at
 * all rather than flashing the mark for one frame.
 */
export function SalaLoader({
  label = 'Loading',
  immediate,
}: {
  label?: string
  /** Skip the fade-in beat — for a caller that has already waited before showing it. */
  immediate?: boolean
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`${immediate ? '' : 'sala-loader '}flex flex-1 flex-col items-center justify-center gap-4 p-6`}
    >
      {/* The text below is what a screen reader announces; the mark is decor. */}
      <span aria-hidden>
        <SalaMark animated className="block h-14 w-14 text-ink" />
      </span>
      <span className="font-mono text-xs tracking-wide text-muted">{label}…</span>
    </div>
  )
}
