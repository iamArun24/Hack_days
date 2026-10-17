import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-b-2 border-border-strong bg-panel px-1 font-sans text-2xs font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

/** Renders "⌘ K" style chords from a list of keys. */
export function KbdCombo({ keys, className }: { keys: readonly string[]; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </span>
  )
}
