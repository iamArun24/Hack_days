import {
  ChevronRight,
  CircleCheck,
  Cookie,
  Lock,
  OctagonAlert,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { Collapsible } from 'radix-ui'
import { useState, type ReactNode } from 'react'
import { MethodLabel, StatusCode } from '@/components/http-labels'
import { EmptyState } from '@/components/ui/empty-state'
import { SegmentedControl, SegmentedItem } from '@/components/ui/tabs'
import type { SecurityFinding, SecuritySeverity } from '@/har/security'
import { cn } from '@/lib/cn'
import { formatPercent, pluralize } from '@/lib/format'
import { useAppStore } from '@/store'
import { selectSecurity } from '@/store/selectors'
import { GRADE_TONE } from './grade-tone'
import { ScoreGauge } from './score-gauge'

const SEVERITY: Record<
  SecuritySeverity,
  { label: string; icon: typeof OctagonAlert; tone: string; chip: string }
> = {
  high: { label: 'High', icon: OctagonAlert, tone: 'text-danger', chip: 'bg-blush/30' },
  medium: { label: 'Medium', icon: TriangleAlert, tone: 'text-warning', chip: 'bg-peach/30' },
  low: { label: 'Low', icon: ShieldAlert, tone: 'text-info', chip: 'bg-sky/25' },
}

const PAGE = 25

function StatChip({
  icon,
  label,
  value,
  ratio,
}: {
  icon: ReactNode
  label: string
  value: string
  ratio: number | null
}) {
  return (
    <div className="spotlight flex min-w-0 card-lift flex-col gap-2 rounded-2xl border bg-panel px-4 py-3">
      <span className="flex items-center gap-2 text-xs text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </span>
      <span className="text-xl font-semibold tracking-tight tabular">{value}</span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-chart-grid">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-1000',
            ratio === null
              ? 'bg-chart-neutral'
              : ratio >= 0.9
                ? 'bg-sage'
                : ratio >= 0.5
                  ? 'bg-butter'
                  : 'bg-blush',
          )}
          style={{ width: `${(ratio ?? 0) * 100}%` }}
        />
      </div>
    </div>
  )
}

function FindingCard({ finding }: { finding: SecurityFinding }) {
  const inspect = useAppStore((s) => s.inspect)
  const [limit, setLimit] = useState(PAGE)
  const sev = SEVERITY[finding.severity]

  return (
    <Collapsible.Root
      defaultOpen={finding.severity === 'high' || finding.items.length <= 6}
      className="group/finding spotlight overflow-hidden rounded-2xl border bg-panel shadow-[var(--shadow-soft)]"
    >
      <Collapsible.Trigger className="flex w-full cursor-default items-start gap-3 px-4 py-3 text-left outline-none hover:bg-muted/40 focus-visible:bg-muted">
        <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg', sev.chip)}>
          <sev.icon className={cn('size-4', sev.tone)} aria-label={sev.label} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold">{finding.title}</span>
            <span className="rounded-md bg-muted px-1.5 text-xs text-muted-foreground tabular">
              {finding.items.length}
            </span>
            <span className={cn('rounded-full px-2 text-2xs font-medium', sev.chip, sev.tone)}>
              {sev.label}
            </span>
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{finding.description}</span>
        </span>
        <ChevronRight className="mt-1 size-4 shrink-0 text-subtle-foreground transition-transform group-data-[state=open]/finding:rotate-90" />
      </Collapsible.Trigger>
      <Collapsible.Content>
        <ul>
          {finding.items.slice(0, limit).map((item, i) => (
            <li key={`${item.entry.id}-${i}`} className="border-t border-border/60">
              <button
                type="button"
                onClick={() => inspect(item.entry.id)}
                className="grid w-full grid-cols-[52px_64px_1fr_auto] items-center gap-3 px-4 py-1.5 text-left text-xs outline-none hover:bg-muted/60 focus-visible:bg-muted"
              >
                <MethodLabel method={item.entry.method} />
                <StatusCode status={item.entry.status} />
                <span className="truncate font-mono" title={item.entry.url}>
                  <span className="text-subtle-foreground">{item.entry.host}</span>
                  {item.entry.path}
                </span>
                <span className="max-w-48 truncate rounded-md bg-muted px-1.5 font-mono text-2xs text-muted-foreground">
                  {item.detail}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {finding.items.length > limit && (
          <button
            type="button"
            onClick={() => setLimit((l) => l + PAGE)}
            className="w-full border-t px-4 py-2 text-left text-xs text-primary outline-none hover:bg-muted/60"
          >
            Show {Math.min(PAGE, finding.items.length - limit)} more
          </button>
        )}
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

type SeverityFilter = 'all' | SecuritySeverity

export function SecurityView() {
  const report = useAppStore(selectSecurity)
  const [filter, setFilter] = useState<SeverityFilter>('all')
  const failing = report.findings.filter((f) => f.items.length > 0)
  const passed = report.findings.filter((f) => f.items.length === 0)
  const shown = failing.filter((f) => filter === 'all' || f.severity === filter)
  const tone = GRADE_TONE[report.grade]
  const { cookies, transport } = report
  const requests = transport.secure + transport.insecure
  const cookieRatio = (n: number) => (cookies.total ? n / cookies.total : null)
  const headersCovered = report.headers.filter((h) => h.total && h.present === h.total).length

  return (
    <div className="@container h-full overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 @3xl:p-6">
        <section
          className={cn(
            'relative flex animate-rise flex-col items-center gap-6 overflow-hidden rounded-3xl border bg-panel p-6 shadow-[var(--shadow-soft)] @2xl:flex-row @2xl:p-8',
          )}
        >
          <div
            className={cn(
              'pointer-events-none absolute -top-24 -right-24 size-72 rounded-full blur-3xl',
              tone.bg,
            )}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-28 -left-20 size-64 rounded-full bg-lavender/20 blur-3xl"
            aria-hidden
          />
          <ScoreGauge score={report.score} grade={report.grade} caption={tone.label} />
          <div className="relative min-w-0 flex-1 text-center @2xl:text-left">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Security posture
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-balance">
              {report.grade === 'A'
                ? 'Looking well protected.'
                : report.grade === 'B'
                  ? 'Solid, with a few gaps.'
                  : report.grade === 'C'
                    ? 'Some things need attention.'
                    : 'Several risks worth fixing.'}
            </h1>
            <p className="mt-2 max-w-xl text-[13px] text-pretty text-muted-foreground">
              {pluralize(
                failing.reduce((n, f) => n + f.items.length, 0),
                'finding',
              )}{' '}
              across {pluralize(failing.length, 'check')} · {headersCovered} of {report.headers.length}{' '}
              security headers on every document · graded from what this capture actually shows.
            </p>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
          <StatChip
            icon={<Lock />}
            label="HTTPS"
            value={requests ? formatPercent(transport.secure / requests) : '—'}
            ratio={requests ? transport.secure / requests : null}
          />
          <StatChip
            icon={<Cookie />}
            label={`Secure cookies (${cookies.total})`}
            value={cookies.total ? formatPercent(cookies.secure / cookies.total) : '—'}
            ratio={cookieRatio(cookies.secure)}
          />
          <StatChip
            icon={<Cookie />}
            label="HttpOnly cookies"
            value={cookies.total ? formatPercent(cookies.httpOnly / cookies.total) : '—'}
            ratio={cookieRatio(cookies.httpOnly)}
          />
          <StatChip
            icon={<Cookie />}
            label="SameSite set"
            value={cookies.total ? formatPercent(cookies.sameSite / cookies.total) : '—'}
            ratio={cookieRatio(cookies.sameSite)}
          />
        </div>

        <section className="rounded-2xl border bg-panel shadow-[var(--shadow-soft)]">
          <header className="flex min-h-11 items-center gap-3 border-b px-4 py-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-[13px] font-semibold">Security headers</h3>
              <p className="truncate text-xs text-muted-foreground">
                Coverage on {pluralize(report.headers[0]?.total ?? 0, 'document')}
              </p>
            </div>
          </header>
          <ul className="grid @3xl:grid-cols-2">
            {report.headers.map((h) => {
              const ratio = h.total ? h.present / h.total : 0
              return (
                <li
                  key={h.header}
                  className="flex flex-col gap-1.5 border-b border-border/60 px-4 py-3 @3xl:odd:border-r"
                >
                  <div className="flex items-center gap-2">
                    {ratio === 1 ? (
                      <CircleCheck className="size-3.5 shrink-0 text-success" aria-label="Present" />
                    ) : (
                      <ShieldAlert className="size-3.5 shrink-0 text-warning" aria-label="Missing" />
                    )}
                    <span className="text-xs font-medium">{h.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground tabular">
                      {h.present}/{h.total}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-chart-grid">
                    <div
                      className={cn(
                        'h-full rounded-full transition-[width] duration-1000',
                        ratio === 1 ? 'bg-sage' : ratio > 0 ? 'bg-butter' : 'bg-blush',
                      )}
                      style={{ width: `${Math.max(ratio, 0.02) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-pretty text-muted-foreground">{h.description}</p>
                </li>
              )
            })}
          </ul>
        </section>

        <header className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">Findings</h2>
            <p className="text-xs text-muted-foreground">Click a request to inspect it.</p>
          </div>
          <SegmentedControl
            type="single"
            value={filter}
            onValueChange={(v) => v && setFilter(v as SeverityFilter)}
            aria-label="Severity"
          >
            <SegmentedItem value="all">All</SegmentedItem>
            {(['high', 'medium', 'low'] as const).map((s) => {
              const Icon = SEVERITY[s].icon
              const count = failing.filter((f) => f.severity === s).reduce((n, f) => n + f.items.length, 0)
              return (
                <SegmentedItem key={s} value={s}>
                  <Icon className={SEVERITY[s].tone} />
                  {SEVERITY[s].label} <span className="text-subtle-foreground tabular">{count}</span>
                </SegmentedItem>
              )
            })}
          </SegmentedControl>
        </header>

        {failing.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck />}
            title="No security findings"
            description="Every check passed for this capture."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {shown.map((f) => (
              <FindingCard key={f.id} finding={f} />
            ))}
            {!shown.length && (
              <p className="py-8 text-center text-xs text-muted-foreground">No {filter}-severity findings.</p>
            )}
          </div>
        )}

        {passed.length > 0 && (
          <section className="rounded-2xl border bg-panel p-4">
            <h2 className="mb-2 text-xs font-semibold text-muted-foreground">Passed checks</h2>
            <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {passed.map((f) => (
                <li key={f.id} className="flex items-start gap-2 text-xs">
                  <CircleCheck className="mt-px size-3.5 shrink-0 text-success" aria-label="Passed" />
                  <span>
                    <span className="font-medium">{f.title}</span>
                    <span className="text-muted-foreground"> · {f.description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
