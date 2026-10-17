import { Tooltip as TooltipPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { KbdCombo } from './kbd'

export const TooltipProvider = TooltipPrimitive.Provider

interface TooltipProps {
  content: ReactNode
  shortcut?: readonly string[]
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  className?: string
  children: ReactNode
}

export function Tooltip({
  content,
  shortcut,
  side = 'top',
  align = 'center',
  className,
  children,
}: TooltipProps) {
  if (!content) return children
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'z-50 flex max-w-80 animate-in items-center gap-2 rounded-lg bg-foreground/92 px-2.5 py-1 text-xs text-background shadow-[0_8px_20px_-8px_hsl(var(--shadow-color)/0.4)] backdrop-blur-md fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            className,
          )}
        >
          <span className="min-w-0">{content}</span>
          {shortcut && (
            <KbdCombo
              keys={shortcut}
              className="[&_kbd]:border-background/20 [&_kbd]:bg-background/15 [&_kbd]:text-background/80"
            />
          )}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
