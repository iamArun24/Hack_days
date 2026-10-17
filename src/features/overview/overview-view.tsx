import { StatTile } from '@/components/charts'
import { profilePerformance, summarize, topBy } from '@/har/metrics'
import { formatBytes, formatDuration, formatNumber, formatPercent, formatTimestamp } from '@/lib/format'
import { useAppStore } from '@/store'
import { selectHealth } from '@/store/selectors'
import { BreakdownCard } from './breakdown-card'
import { ContentTypeCard, StatusCard } from './distribution-cards'
import { HealthCard, PartyCard } from './insight-cards'
import { CachingCard, ProtocolCard, TimingCard, TopRequestsCard } from './performance-cards'

export function OverviewView() {
  const entries = useAppStore((s) => s.entries)
  const log = useAppStore((s) => s.log)
  const fileName = useAppStore((s) => s.fileName)
  const summary = summarize(entries, log)
  const profile = profilePerformance(entries)
  const health = useAppStore(selectHealth)
  const started = log?.pages?.[0]?.startedDateTime ?? entries[0]?.raw.startedDateTime
  const title = log?.pages?.[0]?.title

  return (
    <div className="@container h-full overflow-y-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 @3xl:p-6">
        <header className="relative flex animate-rise flex-wrap items-end justify-between gap-3 pt-2">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Overview</p>
            <h1 className="mt-1 truncate font-display text-3xl font-semibold tracking-tight" title={fileName}>
              {title || fileName || 'Capture'}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {title && fileName && <span className="font-mono">{fileName}</span>}
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-sage" aria-hidden />
                captured {formatTimestamp(started)}
              </span>
              {log?.creator && (
                <span className="rounded-full border bg-panel px-2 py-0.5 text-2xs">
                  {log.creator.name} {log.creator.version}
                </span>
              )}
            </p>
          </div>
        </header>

        <HealthCard health={health} />

        <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @6xl:grid-cols-6">
          <StatTile
            label="Requests"
            value={formatNumber(summary.requests)}
            hint={`${formatNumber(summary.domains)} domains`}
          />
          <StatTile
            label="Transferred"
            value={formatBytes(summary.transferredBytes)}
            hint={`${formatBytes(summary.contentBytes)} resources`}
          />
          <StatTile label="Finish" value={formatDuration(summary.finish)} hint="First start to last byte" />
          <StatTile
            label="DOMContentLoaded"
            value={formatDuration(summary.domContentLoaded)}
            hint={summary.domContentLoaded ? 'From page timings' : 'Not recorded'}
          />
          <StatTile
            label="Load"
            value={formatDuration(summary.load)}
            hint={summary.load ? 'From page timings' : 'Not recorded'}
          />
          <StatTile
            label="Failed"
            value={formatNumber(summary.errors)}
            hint={
              summary.requests
                ? `${formatPercent(summary.errors / summary.requests, 1)} of requests`
                : undefined
            }
            tone={summary.errors ? 'danger' : 'default'}
          />
        </div>

        <div className="grid gap-4 @4xl:grid-cols-2">
          <StatusCard entries={entries} />
          <ContentTypeCard entries={entries} />
        </div>

        <div className="grid gap-4 @5xl:grid-cols-[3fr_2fr]">
          <BreakdownCard entries={entries} />
          <PartyCard entries={entries} />
        </div>

        <div className="grid gap-4 @4xl:grid-cols-2 @6xl:grid-cols-3">
          <TimingCard profile={profile} />
          <CachingCard profile={profile} />
          <ProtocolCard profile={profile} total={entries.length} />
        </div>

        <div className="grid gap-4 @4xl:grid-cols-2">
          <TopRequestsCard
            title="Slowest requests"
            entries={topBy(entries, (e) => e.time, 6)}
            metric={(e) => formatDuration(e.time)}
          />
          <TopRequestsCard
            title="Largest responses"
            entries={topBy(entries, (e) => e.size, 6)}
            metric={(e) => formatBytes(e.size)}
          />
        </div>
      </div>
    </div>
  )
}
