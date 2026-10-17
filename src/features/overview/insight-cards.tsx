import { Lightbulb, Sparkles } from 'lucide-react'
import { Card } from '@/components/charts'
import { partyBreakdown } from '@/har/endpoints'
import type { HealthScore } from '@/har/score'
import type { Entry } from '@/har/types'
import { cn } from '@/lib/cn'
import { formatBytes, formatDuration, formatNumber, formatPercent } from '@/lib/format'
import { useAppStore } from '@/store'
import { GRADE_TONE } from '../security/grade-tone'
import { ScoreGauge } from '../security/score-gauge'

const factorTone = (score: number) => (score >= 0.85 ? 'bg-sage' : score >= 0.55 ? 'bg-butter' : 'bg-blush')

export function HealthCard({ health }: { health: HealthScore }) {
  const tone = GRADE_TONE[health.grade]
  return (
    <section className="spotlight relative overflow-hidden rounded-3xl border bg-panel shadow-[var(--shadow-soft)]">
      <div
        className={cn('pointer-events-none absolute -top-28 -left-24 size-80 rounded-full blur-3xl', tone.bg)}
        aria-hidden
      />
      <div className="relative grid gap-6 p-5 @4xl:grid-cols-[auto_1fr_minmax(0,22rem)] @4xl:p-6">
        <div className="flex flex-col items-center gap-2">
          <ScoreGauge score={health.score} grade={health.grade} caption="Health" />
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', tone.bg, tone.text)}>
            {tone.label}
          </span>
        </div>

        <div className="flex min-w-0 flex-col gap-2.5">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold">
            <Sparkles className="size-4 text-primary" /> What shapes the score
          </h2>
          <ul className="grid gap-x-6 gap-y-2.5 @2xl:grid-cols-2">
            {health.factors.map((f) => (
              <li key={f.id} className="flex min-w-0 flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium">{f.label}</span>
                  <span className="truncate text-subtle-foreground">{f.detail}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-chart-grid">
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-1000',
                      factorTone(f.score),
                    )}
                    style={{ width: `${Math.max(0.03, f.score) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex min-w-0 flex-col gap-2 rounded-2xl border bg-background/60 p-4">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold">
            <Lightbulb className="size-4 text-warning" /> Suggestions
          </h2>
          {health.tips.length ? (
            <ol className="flex flex-col gap-2 text-xs text-muted-foreground">
              {health.tips.slice(0, 4).map((tip, i) => (
                <li key={tip} className="flex gap-2">
                  <span className="grid size-4 shrink-0 place-items-center rounded-full bg-lavender/30 text-2xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span className="text-pretty">{tip}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-muted-foreground">Nothing stands out. This capture looks healthy.</p>
          )}
        </div>
      </div>
    </section>
  )
}

const THIRD_SWATCHES = ['bg-lavender', 'bg-peach', 'bg-sky', 'bg-blush', 'bg-butter']

export function PartyCard({ entries }: { entries: readonly Entry[] }) {
  const rows = partyBreakdown(entries)
  const total = entries.length || 1
  const first = rows.filter((r) => r.firstParty)
  const third = rows.filter((r) => !r.firstParty)
  const firstCount = first.reduce((n, r) => n + r.count, 0)
  const swatch = (i: number, firstParty: boolean) =>
    firstParty ? 'bg-sage' : THIRD_SWATCHES[i % THIRD_SWATCHES.length]!

  const drillDown = (domain: string) => {
    const store = useAppStore.getState()
    store.resetFilters()
    store.setQuery(domain)
    store.setView('requests')
  }

  return (
    <Card
      title="First vs third party"
      description={`${formatPercent(firstCount / total)} first-party · ${formatNumber(third.length)} third-party sites`}
      className="spotlight card-lift rounded-2xl"
    >
      <div className="flex flex-col gap-3 p-4">
        <div
          className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full"
          role="img"
          aria-label="Requests by site"
        >
          {rows.slice(0, 12).map((r, i) => (
            <span
              key={r.domain}
              className={cn(
                'h-full first:rounded-l-full last:rounded-r-full',
                swatch(i - first.length, r.firstParty),
              )}
              style={{ flexGrow: r.count }}
              title={`${r.domain}: ${r.count}`}
            />
          ))}
        </div>
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-panel text-left text-muted-foreground">
              <tr className="border-b">
                <th className="py-1.5 font-medium">Site</th>
                <th className="px-2 py-1.5 text-right font-medium">Requests</th>
                <th className="px-2 py-1.5 text-right font-medium">Bytes</th>
                <th className="py-1.5 text-right font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.domain}
                  onClick={() => drillDown(r.domain)}
                  className="cursor-default border-b border-border/60 last:border-0 hover:bg-muted/60"
                >
                  <td className="max-w-0 py-1.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn('size-2 shrink-0 rounded-full', swatch(i - first.length, r.firstParty))}
                        aria-hidden
                      />
                      <span className="truncate font-mono">{r.domain}</span>
                      {r.firstParty && (
                        <span className="shrink-0 rounded-full bg-sage/30 px-1.5 text-2xs text-success">
                          1st
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular">{formatNumber(r.count)}</td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground tabular">
                    {formatBytes(r.bytes)}
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground tabular">
                    {formatDuration(r.time)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  )
}
