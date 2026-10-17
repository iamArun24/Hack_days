import { PanelLeft, Sparkles } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { countActiveFilters } from '@/har/filter'
import { useIsDesktop } from '@/hooks/use-media-query'
import { cn } from '@/lib/cn'
import { formatNumber } from '@/lib/format'
import { MOD } from '@/lib/platform'
import { useAppStore } from '@/store'
import { useCriteria, useVisibleEntries } from '@/store/selectors'
import { FOCUS_AI_FILTER_EVENT } from '../ai-settings/events'
import { ActiveFilters } from './active-filters'
import { AiFilterChip, AiFilterField } from './ai-filter'
import { SearchField } from './search-field'

/** Shared header for the filtered views (requests, waterfall, timeline). */
export function FilterToolbar({ actions }: { actions?: ReactNode }) {
  const isDesktop = useIsDesktop()
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
  const total = useAppStore((s) => s.entries.length)
  const shown = useVisibleEntries().length
  const active = countActiveFilters(useCriteria())
  const [aiMode, setAiMode] = useState(false)

  // Ctrl/⌘+I (and the palette's "Ask to filter…") switch the search box into AI mode.
  useEffect(() => {
    const enter = () => setAiMode(true)
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        setAiMode(true)
        dispatchEvent(new Event(FOCUS_AI_FILTER_EVENT))
      }
    }
    addEventListener(FOCUS_AI_FILTER_EVENT, enter)
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener(FOCUS_AI_FILTER_EVENT, enter)
      removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b bg-panel/40 px-3 py-2 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <Tooltip content={sidebarOpen && isDesktop ? 'Hide filters' : 'Show filters'} shortcut={['F']}>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-pressed={sidebarOpen}
            aria-label="Toggle filters"
            className={cn('relative', sidebarOpen && isDesktop && 'text-foreground')}
          >
            <PanelLeft />
            {active > 0 && (!sidebarOpen || !isDesktop) && (
              <span className="absolute top-1 right-1 size-1.5 animate-breathe rounded-full bg-primary" />
            )}
          </Button>
        </Tooltip>
        {aiMode ? (
          <AiFilterField className="max-w-xl flex-1" onExit={() => setAiMode(false)} />
        ) : (
          <SearchField className="max-w-xl flex-1" />
        )}
        {!aiMode && (
          <Tooltip content="Describe what you want to see in plain English" shortcut={[MOD, 'I']}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAiMode(true)}
              className="shrink-0 gap-1 rounded-full text-primary hover:bg-primary/10 hover:text-primary"
            >
              <Sparkles /> <span className="hidden md:inline">Ask AI</span>
            </Button>
          </Tooltip>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <span className="px-1 text-xs whitespace-nowrap text-muted-foreground tabular" aria-live="polite">
            {shown === total ? (
              <>{formatNumber(total)} requests</>
            ) : (
              <>
                <span className="font-medium text-foreground">{formatNumber(shown)}</span> of{' '}
                {formatNumber(total)}
              </>
            )}
          </span>
          {actions}
        </div>
      </div>
      <AiFilterChip />
      <ActiveFilters />
    </div>
  )
}
