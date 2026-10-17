import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex animate-rise flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div className="relative grid size-12 animate-float place-items-center rounded-2xl border bg-[linear-gradient(140deg,color-mix(in_oklab,var(--color-lavender)_35%,var(--color-panel)),color-mix(in_oklab,var(--color-peach)_30%,var(--color-panel)))] text-primary shadow-[var(--shadow-soft)] [&_svg]:size-5">
          {icon}
        </div>
      )}
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-[13px] font-medium">{title}</p>
        {description && <p className="text-xs text-pretty text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}
