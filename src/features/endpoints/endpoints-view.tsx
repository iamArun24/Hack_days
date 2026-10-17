import { ArrowDown, ArrowUp, ChevronRight, Route, Search } from 'lucide-react'
import { Fragment, useState } from 'react'
import { MethodLabel, StatusCode } from '@/components/http-labels'
import { EmptyState } from '@/components/ui/empty-state'
import { SegmentedControl, SegmentedItem } from '@/components/ui/tabs'
import { groupEndpoints, type Endpoint } from '@/har/endpoints'
import { cn } from '@/lib/cn'
import { formatBytes, formatDuration, formatNumber, formatPercent, pluralize } from '@/lib/format'
import { useAppStore } from '@/store'
import { selectEntryMap, useVisibleEntries } from '@/store/selectors'
import { OpenApiAction } from './openapi-dialog'

type SortKey = 'count' | 'errorRate' | 'p50' | 'p95' | 'max' | 'bytes'

const COLUMNS: ReadonlyArray<{ key: SortKey; label: string; className?: string }> = [
  { key: 'count', label: 'Calls' },
  { key: 'errorRate', label: 'Errors', className: 'w-28' },
  { key: 'p50', label: 'p50' },
  { key: 'p95', label: 'p95' },
  { key: 'max', label: 'Max' },
  { key: 'bytes', label: 'Bytes' },
]

/** `/users/:id/posts` with each parameter drawn as a soft pill. */
function Pattern({ pattern }: { pattern: string }) {
  const parts = pattern.split(/(:[a-z]+)/)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith(':') ? (
          <span key={i} className="mx-px rounded-md bg-lavender/30 px-1 text-primary">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}

/** min → p50 → p95 → max on a log scale shared by every row, so rows compare at a glance. */
function LatencyBar({ e, scale }: { e: Endpoint; scale: (ms: number) => number }) {
  const at = (v: number) => `${scale(v) * 100}%`
  return (
    <div
      className="relative h-3 w-full min-w-24"
      role="img"
      aria-label={`min ${formatDuration(e.min)}, p50 ${formatDuration(e.p50)}, p95 ${formatDuration(e.p95)}, max ${formatDuration(e.max)}`}
    >
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-chart-grid" />
      <div
        className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-chart-neutral"
        style={{ left: at(e.min), width: `calc(${at(e.max)} - ${at(e.min)})` }}
      />
      <div
        className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-sky"
        style={{ left: at(e.p50), width: `max(4px, calc(${at(e.p95)} - ${at(e.p50)}))` }}
      />
      <div
        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel bg-primary"
        style={{ left: at(e.p50) }}
      />
    </div>
  )
}

function ErrorMeter({ rate }: { rate: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-chart-grid">
        <div
          className={cn(
            'h-full rounded-full',
            rate === 0 ? 'bg-sage' : rate < 0.1 ? 'bg-butter' : 'bg-blush',
          )}
          style={{ width: `${Math.max(rate, rate ? 0.06 : 0) * 100}%` }}
        />
      </div>
      <span className={cn('tabular', rate ? 'text-danger' : 'text-subtle-foreground')}>
        {rate ? formatPercent(rate, rate < 0.1 ? 1 : 0) : '—'}
      </span>
    </div>
  )
}

function Requests({ ids }: { ids: number[] }) {
  const map = useAppStore(selectEntryMap)
  const inspect = useAppStore((s) => s.inspect)
  const [limit, setLimit] = useState(20)
  return (
    <div className="border-t border-border/60 bg-muted/30 py-1">
      {ids.slice(0, limit).map((id) => {
        const e = map.get(id)
        if (!e) return null
        return (
          <button
            key={id}
            type="button"
            onClick={() => inspect(id)}
            className="grid w-full grid-cols-[64px_1fr_auto_auto] items-center gap-3 px-4 py-1 pl-14 text-left text-xs outline-none hover:bg-muted/70 focus-visible:bg-muted"
          >
            <StatusCode status={e.status} />
            <span className="truncate font-mono text-muted-foreground" title={e.url}>
              {e.path}
            </span>
            <span className="text-subtle-foreground tabular">{formatBytes(e.size)}</span>
            <span className="w-16 text-right font-medium tabular">{formatDuration(e.time)}</span>
          </button>
        )
      })}
      {ids.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + 20)}
          className="px-4 py-1.5 pl-14 text-xs text-primary outline-none hover:underline"
        >
          Show {Math.min(20, ids.length - limit)} more
        </button>
      )}
    </div>
  )
}

export function EndpointsView() {
  const entries = useVisibleEntries()
  const [apiOnly, setApiOnly] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'count', desc: true })
  const [open, setOpen] = useState<string | null>(null)

  const all = groupEndpoints(entries, { apiOnly })
  const q = query.trim().toLowerCase()
  const rows = all
    .filter((e) => !q || e.key.toLowerCase().includes(q))
    .sort((a, b) => (sort.desc ? b[sort.key] - a[sort.key] : a[sort.key] - b[sort.key]))

  const maxMs = Math.max(1, ...rows.map((r) => r.max))
  const scale = (ms: number) => Math.log1p(Math.max(0, ms)) / Math.log1p(maxMs)
  const calls = rows.reduce((n, r) => n + r.count, 0)
  const failing = rows.filter((r) => r.errors > 0).length

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }))

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 @3xl:px-6">
        <div className="mr-auto">
          <h1 className="font-display text-lg font-semibold tracking-tight">Endpoints</h1>
          <p className="text-xs text-muted-foreground">
            {pluralize(rows.length, 'route')} · {pluralize(calls, 'call')}
            {failing > 0 && <span className="text-danger"> · {failing} with errors</span>}
          </p>
        </div>
        <label className="flex h-8 w-56 items-center gap-2 rounded-lg border bg-background px-2.5 text-xs focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-ring/20">
          <Search className="size-3.5 text-subtle-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter routes…"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-subtle-foreground"
            aria-label="Filter routes"
          />
        </label>
        <SegmentedControl
          type="single"
          value={apiOnly ? 'api' : 'all'}
          onValueChange={(v) => v && setApiOnly(v === 'api')}
          aria-label="Scope"
        >
          <SegmentedItem value="api">API only</SegmentedItem>
          <SegmentedItem value="all">All requests</SegmentedItem>
        </SegmentedControl>
        <OpenApiAction endpoints={rows} entries={entries} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          className="flex-1"
          icon={<Route />}
          title={q ? 'No matching routes' : 'No API calls in view'}
          description={
            apiOnly
              ? 'Nothing here looks like an API call. Switch to “All requests” to group every route.'
              : undefined
          }
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="sticky top-0 z-10 bg-panel/90 text-left text-muted-foreground backdrop-blur">
              <tr className="border-b">
                <th className="w-[34%] py-2 pr-2 pl-4 font-medium @3xl:pl-6">Route</th>
                <th className="w-[18%] px-2 py-2 font-medium">Latency (log)</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className={cn('px-2 py-2 text-right font-medium', c.className)}>
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40',
                        sort.key === c.key && 'text-foreground',
                      )}
                    >
                      {c.label}
                      {sort.key === c.key &&
                        (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                    </button>
                  </th>
                ))}
                <th className="py-2 pr-4 pl-2 font-medium @3xl:pr-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const expanded = open === e.key
                return (
                  <Fragment key={e.key}>
                    <tr
                      onClick={() => setOpen(expanded ? null : e.key)}
                      className={cn(
                        'cursor-default border-b border-border/60 transition-colors hover:bg-muted/50',
                        expanded && 'bg-selection',
                      )}
                    >
                      <td className="max-w-0 py-2 pr-2 pl-4 @3xl:pl-6">
                        <div className="flex min-w-0 items-center gap-2">
                          <ChevronRight
                            className={cn(
                              'size-3.5 shrink-0 text-subtle-foreground transition-transform',
                              expanded && 'rotate-90',
                            )}
                          />
                          <MethodLabel method={e.method} className="w-12 shrink-0" />
                          <span className="truncate font-mono" title={e.key}>
                            <span className="text-subtle-foreground">{e.host}</span>
                            <Pattern pattern={e.pattern} />
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <LatencyBar e={e} scale={scale} />
                      </td>
                      <td className="px-2 py-2 text-right font-medium tabular">{formatNumber(e.count)}</td>
                      <td className="px-2 py-2">
                        <div className="flex justify-end">
                          <ErrorMeter rate={e.errorRate} />
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular">{formatDuration(e.p50)}</td>
                      <td className="px-2 py-2 text-right tabular">{formatDuration(e.p95)}</td>
                      <td className="px-2 py-2 text-right text-muted-foreground tabular">
                        {formatDuration(e.max)}
                      </td>
                      <td className="px-2 py-2 text-right text-muted-foreground tabular">
                        {formatBytes(e.bytes)}
                      </td>
                      <td className="py-2 pr-4 pl-2 @3xl:pr-6">
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                          {e.statuses.slice(0, 4).map((s) => (
                            <StatusCode key={s} status={s} />
                          ))}
                          {e.statuses.length > 4 && (
                            <span className="text-subtle-foreground">+{e.statuses.length - 4}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={COLUMNS.length + 3} className="p-0">
                          <Requests ids={e.ids} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
