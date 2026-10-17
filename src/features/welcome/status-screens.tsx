import { FileDown } from 'lucide-react'
import { LogoMark } from '@/components/brand'

const RING = 2 * Math.PI * 46

/** Orbiting-packet loader with a progress ring (indeterminate when progress is null). */
export function LoadingScreen({
  label,
  detail,
  progress,
}: {
  label: string
  detail?: string
  progress: number | null
}) {
  const pct = progress === null ? null : Math.max(0, Math.min(1, progress))
  return (
    <div
      className="relative grid h-full place-items-center overflow-hidden bg-background p-6"
      role="status"
      aria-live="polite"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/4 size-80 animate-aurora rounded-full bg-(--aurora-1) blur-3xl" />
        <div className="absolute right-1/4 bottom-1/4 size-80 animate-aurora rounded-full bg-(--aurora-2) blur-3xl [animation-delay:-7s]" />
      </div>
      <div className="relative flex w-full max-w-sm animate-rise flex-col items-center gap-6 text-center">
        <div className="relative grid size-32 place-items-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r="46" fill="none" strokeWidth="2.5" className="stroke-border" />
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              stroke="url(#loader-gradient)"
              strokeDasharray={RING}
              strokeDashoffset={pct === null ? RING * 0.72 : RING * (1 - pct)}
              className={
                pct === null ? 'origin-center animate-orbit' : 'transition-[stroke-dashoffset] duration-300'
              }
            />
            <defs>
              <linearGradient id="loader-gradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--color-lavender)" />
                <stop offset="0.5" stopColor="var(--color-primary)" />
                <stop offset="1" stopColor="var(--color-peach)" />
              </linearGradient>
            </defs>
          </svg>
          {/* Three packets orbiting at different speeds. */}
          {[
            ['bg-sage', '2.4s', '0s', 'size-2.5'],
            ['bg-peach', '3.6s', '-1.2s', 'size-2'],
            ['bg-sky', '5s', '-2.5s', 'size-1.5'],
          ].map(([color, duration, delay, size]) => (
            <span
              key={color}
              aria-hidden
              className="absolute inset-3 animate-orbit"
              style={{ animationDuration: duration, animationDelay: delay }}
            >
              <span
                className={`absolute top-0 left-1/2 -translate-x-1/2 rounded-full shadow-sm ${color} ${size}`}
              />
            </span>
          ))}
          <span className="grid size-14 animate-breathe place-items-center rounded-2xl bg-panel shadow-[var(--shadow-lift)]">
            <LogoMark className="size-8" />
          </span>
        </div>
        <div>
          <p className="font-display text-[17px] font-semibold tracking-tight">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground tabular">
            {detail}
            {pct !== null && (
              <span className="ml-1.5 font-medium text-primary">{Math.round(pct * 100)}%</span>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

export function DropOverlay({ visible, replacing }: { visible: boolean; replacing: boolean }) {
  if (!visible) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] grid animate-in place-items-center bg-background/60 p-6 backdrop-blur-md duration-300 fade-in-0">
      <div className="relative flex w-full max-w-md animate-in flex-col items-center gap-3 rounded-[28px] border bg-panel/90 px-8 py-14 text-center shadow-overlay duration-500 zoom-in-90">
        <span aria-hidden className="absolute inset-0 overflow-hidden rounded-[28px]">
          <span className="absolute -inset-1/2 animate-orbit bg-[conic-gradient(from_0deg,transparent,var(--color-lavender),transparent_30%,var(--color-peach),transparent_60%,var(--color-sage),transparent)] opacity-35 [animation-duration:6s]" />
          <span className="absolute inset-[2px] rounded-[26px] bg-panel/95" />
        </span>
        <span className="relative grid size-16 animate-float place-items-center rounded-full border-2 border-dashed border-primary/60 bg-primary/8">
          <FileDown className="size-7 text-primary" />
        </span>
        <p className="relative font-display text-lg font-semibold tracking-tight">Release to open</p>
        <p className="relative text-xs text-muted-foreground">
          {replacing
            ? 'Replaces the current capture. Drop several files to merge them.'
            : 'Drop several files to merge them into one capture.'}
        </p>
      </div>
    </div>
  )
}
