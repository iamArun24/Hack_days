import type { ReactNode } from 'react'
import { PHASES } from '@/har/timings'
import { cn } from '@/lib/cn'
import { AnimatedValue } from './animated-value'

/** Horizontal bar with a 4px rounded data end, anchored at the baseline (dataviz mark spec). */
export function Meter({
  ratio,
  className,
  trackClassName,
}: {
  ratio: number
  className?: string
  trackClassName?: string
}) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-chart-grid', trackClassName)}>
      <div
        className={cn(
          'h-full rounded-full bg-chart-series transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]',
          className,
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function LegendSwatch({ className }: { className: string }) {
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', className)} aria-hidden />
}

export function Legend({
  items,
  className,
}: {
  items: ReadonlyArray<{ label: ReactNode; swatch: string }>
  className?: string
}) {
  return (
    <ul
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground', className)}
    >
      {items.map((item, i) => (
        <li key={i} className="inline-flex items-center gap-1.5">
          <LegendSwatch className={item.swatch} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

export function PhaseLegend({ className }: { className?: string }) {
  return <Legend className={className} items={PHASES.map((p) => ({ label: p.label, swatch: p.swatch }))} />
}

interface StatTileProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'danger' | 'warning'
}

export function StatTile({ label, value, hint, tone = 'default' }: StatTileProps) {
  return (
    <div className="group/tile spotlight relative flex min-w-0 card-lift animate-rise flex-col gap-1 overflow-hidden rounded-2xl border bg-panel px-4 py-3.5">
      <span
        aria-hidden
        className={cn(
          'absolute -top-8 -right-8 size-20 rounded-full opacity-40 blur-2xl transition-opacity duration-500 group-hover/tile:opacity-80',
          tone === 'danger' ? 'bg-blush' : tone === 'warning' ? 'bg-butter' : 'bg-lavender',
        )}
      />
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          'truncate font-display text-[22px] font-semibold tracking-tight tabular',
          tone === 'danger' && 'text-danger',
          tone === 'warning' && 'text-warning',
        )}
      >
        <AnimatedValue value={value} />
      </span>
      {hint && <span className="truncate text-xs text-subtle-foreground">{hint}</span>}
    </div>
  )
}

export function Card({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section
      className={cn(
        'spotlight flex min-w-0 card-lift animate-rise flex-col overflow-hidden rounded-2xl border bg-panel',
        className,
      )}
    >
      <header className="flex min-h-12 items-center gap-3 border-b border-border/70 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[14px] font-semibold tracking-tight">{title}</h3>
          {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  )
}
