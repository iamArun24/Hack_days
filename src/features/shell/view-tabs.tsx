import { useLayoutEffect, useRef, useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import { formatNumber } from '@/lib/format'
import { useAppStore } from '@/store'
import { selectIssueCount } from '@/store/selectors'
import type { ViewId } from '@/store/ui-slice'
import { VIEWS } from './views'

interface Indicator {
  left: number
  width: number
}

/** Pill navigation with a sliding indicator that springs to the active view. */
export function ViewTabs() {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const issues = useAppStore(selectIssueCount)
  const requests = useAppStore((s) => s.entries.length)
  const comparing = useAppStore((s) => s.comparison !== null)
  const listRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState<Indicator | null>(null)

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const measure = () => {
      const active = list.querySelector<HTMLElement>('[data-state="active"]')
      if (!active) return
      setIndicator({ left: active.offsetLeft, width: active.offsetWidth })
      const { scrollLeft, clientWidth } = list
      if (active.offsetLeft < scrollLeft || active.offsetLeft + active.offsetWidth > scrollLeft + clientWidth)
        active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    for (const child of list.children) observer.observe(child)
    return () => observer.disconnect()
  }, [view, issues, requests, comparing])

  const badge = (id: ViewId) => {
    if (id === 'requests') return formatNumber(requests)
    if (id === 'issues' && issues) return formatNumber(issues)
    if (id === 'compare' && comparing) return '•'
    return null
  }

  return (
    <Tabs value={view} onValueChange={(v) => setView(v as ViewId)}>
      <div className="relative z-10 border-b border-border/70 bg-panel/40 px-3 py-1.5 backdrop-blur-md">
        <TabsList
          ref={listRef}
          className="relative h-9 gap-1 [mask-image:linear-gradient(90deg,transparent,black_12px,black_calc(100%-12px),transparent)] px-1"
          aria-label="Views"
        >
          {indicator && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0.5 rounded-full border border-primary/20 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-lavender)_38%,var(--color-panel)),color-mix(in_oklab,var(--color-peach)_26%,var(--color-panel)))] shadow-[0_6px_18px_-10px_var(--color-primary)] transition-[left,width] duration-500 ease-[cubic-bezier(0.34,1.36,0.64,1)]"
              style={{ left: indicator.left, width: indicator.width }}
            />
          )}
          {VIEWS.map((v, i) => {
            const count = badge(v.id)
            return (
              <Tooltip key={v.id} content={v.description} shortcut={[String((i + 1) % 10)]} side="bottom">
                <TabsTrigger
                  value={v.id}
                  className="z-10 rounded-full px-3 transition-colors duration-300 after:hidden hover:bg-muted/60 data-[state=active]:hover:bg-transparent"
                >
                  <v.icon className="size-4 text-subtle-foreground transition-[color,transform] duration-300 in-data-[state=active]:scale-110 in-data-[state=active]:text-primary" />
                  {v.label}
                  {count && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 text-2xs font-medium tabular',
                        v.id === 'issues' ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {count}
                    </span>
                  )}
                </TabsTrigger>
              </Tooltip>
            )
          })}
        </TabsList>
      </div>
    </Tabs>
  )
}
