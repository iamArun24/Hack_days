import { ChevronRight, CircleHelp, ListChecks, Target, Users } from 'lucide-react'
import { Collapsible } from 'radix-ui'
import { useState, type ReactNode } from 'react'
import type { ActionItem, DiagnosisReport, Finding } from '@/ai'
import { MethodLabel } from '@/components/http-labels'
import { SegmentedControl, SegmentedItem } from '@/components/ui/tabs'
import { gradeOf } from '@/har/security'
import type { Entry } from '@/har/types'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/store'
import { ScoreGauge } from '../security/score-gauge'
import { AGENT_META } from './agent-meta'

const SEVERITIES: ReadonlyArray<Finding['severity']> = ['critical', 'high', 'medium', 'low']

const SEVERITY_TONE: Record<Finding['severity'], { pill: string; dot: string }> = {
  critical: { pill: 'bg-blush/40 text-danger', dot: 'bg-danger' },
  high: { pill: 'bg-peach/45 text-warning', dot: 'bg-warning' },
  medium: { pill: 'bg-butter/50 text-warning', dot: 'bg-butter' },
  low: { pill: 'bg-sky/35 text-info', dot: 'bg-info' },
}

const LEVEL_TONE: Record<ActionItem['impact'], string> = {
  high: 'bg-sage/45 text-success',
  medium: 'bg-butter/50 text-warning',
  low: 'bg-muted text-muted-foreground',
}

const OWNERS: ReadonlyArray<ActionItem['owner']> = ['frontend', 'backend', 'devops', 'security']

export function Pill({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-2xs font-semibold capitalize',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Uniform card shell so every block on the page shares one edge, radius and padding rhythm. */
export function Panel({
  title,
  icon: Icon,
  aside,
  className,
  children,
}: {
  title?: string
  icon?: typeof Target
  aside?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cn('rounded-2xl border bg-panel/85 shadow-[var(--shadow-soft)]', className)}>
      {title && (
        <header className="flex items-center gap-2 border-b px-4 py-3">
          {Icon && <Icon className="size-4 text-primary" />}
          <h2 className="min-w-0 flex-1 text-[13px] font-semibold">{title}</h2>
          {aside}
        </header>
      )}
      {children}
    </section>
  )
}

export function RequestChips({ ids, byId }: { ids: readonly number[]; byId: ReadonlyMap<number, Entry> }) {
  const inspect = useAppStore((s) => s.inspect)
  const known = ids.filter((id) => byId.has(id))
  if (!known.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {known.slice(0, 6).map((id) => {
        const e = byId.get(id)!
        return (
          <button
            key={id}
            type="button"
            onClick={() => inspect(id)}
            title={e.url}
            className="inline-flex max-w-64 items-center gap-1.5 rounded-md border bg-background/70 px-1.5 py-0.5 font-mono text-2xs outline-none hover:border-primary/40 hover:bg-selection focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span className="text-subtle-foreground">#{id}</span>
            <MethodLabel method={e.method} className="text-2xs" />
            <span className="truncate">{e.path}</span>
          </button>
        )
      })}
      {known.length > 6 && (
        <span className="self-center text-2xs text-muted-foreground">+{known.length - 6} more</span>
      )}
    </div>
  )
}

/* ─── Summary band: verdict, headline and the numbers that matter ─── */

export function SummaryBand({ report, flagged }: { report: DiagnosisReport; flagged: number }) {
  const score = Math.max(0, Math.min(100, Math.round(report.score)))
  const counts = SEVERITIES.map((s) => ({ s, n: report.rootCauses.filter((f) => f.severity === s).length }))

  return (
    <section className="grid animate-rise items-center gap-6 rounded-2xl border p-5 shadow-[var(--shadow-soft)] glass md:grid-cols-[auto_minmax(0,1fr)] xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:p-6">
      <ScoreGauge score={score} grade={gradeOf(score)} size={124} caption="AI verdict" />
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">Verdict</p>
        <h2 className="mt-1.5 font-display text-[clamp(1.2rem,2vw,1.6rem)] leading-snug font-medium text-balance">
          {report.headline}
        </h2>
      </div>
      <dl className="grid grid-cols-3 gap-x-6 gap-y-3 border-t pt-4 sm:grid-cols-6 md:col-span-2 xl:col-span-1 xl:w-72 xl:grid-cols-2 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-6">
        {counts.map(({ s, n }) => (
          <div key={s}>
            <dt className="flex items-center gap-1.5 text-2xs text-muted-foreground capitalize">
              <span className={cn('size-1.5 rounded-full', SEVERITY_TONE[s].dot)} /> {s}
            </dt>
            <dd className={cn('font-display text-xl tabular', !n && 'text-subtle-foreground')}>{n}</dd>
          </div>
        ))}
        <div>
          <dt className="text-2xs text-muted-foreground">Actions</dt>
          <dd className="font-display text-xl tabular">{report.actionPlan.length}</dd>
        </div>
        <div>
          <dt className="text-2xs text-muted-foreground">Requests flagged</dt>
          <dd className="font-display text-xl tabular">{flagged}</dd>
        </div>
      </dl>
    </section>
  )
}

/* ─── Main column: root causes / action plan / specialists, one at a time ─── */

function RootCause({
  f,
  n,
  byId,
  open,
}: {
  f: Finding
  n: number
  byId: ReadonlyMap<number, Entry>
  open: boolean
}) {
  return (
    <Collapsible.Root defaultOpen={open} className="group/rc border-b last:border-b-0">
      <Collapsible.Trigger className="flex w-full items-center gap-3 px-4 py-3.5 text-left outline-none hover:bg-muted/40 focus-visible:bg-muted">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted font-mono text-2xs font-semibold tabular">
          {n}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{f.title}</span>
        {f.impact && (
          <span className="hidden truncate text-2xs text-muted-foreground lg:inline lg:max-w-40">
            {f.impact}
          </span>
        )}
        <Pill className={SEVERITY_TONE[f.severity].pill}>{f.severity}</Pill>
        <ChevronRight className="size-4 shrink-0 text-subtle-foreground transition-transform group-data-[state=open]/rc:rotate-90" />
      </Collapsible.Trigger>
      <Collapsible.Content className="pr-4 pb-4 pl-13">
        <p className="text-[13px] leading-relaxed text-pretty text-muted-foreground">{f.detail}</p>
        {f.fix.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
              How to fix
            </p>
            <ol className="flex flex-col gap-1.5">
              {f.fix.map((step, i) => (
                <li key={i} className="flex gap-2 text-[13px]">
                  <span className="mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full bg-primary/12 text-2xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span className="text-pretty">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        <div className="mt-3">
          <RequestChips ids={f.entryIds} byId={byId} />
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

function ActionPlan({ report, byId }: { report: DiagnosisReport; byId: ReadonlyMap<number, Entry> }) {
  const owners = OWNERS.filter((o) => report.actionPlan.some((a) => a.owner === o))
  if (!owners.length) return <Empty>No actions proposed.</Empty>
  return (
    <div className="divide-y">
      {owners.map((owner) => (
        <div key={owner} className="px-4 py-3">
          <p className="mb-2 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">{owner}</p>
          <ul className="flex flex-col gap-2">
            {report.actionPlan
              .filter((a) => a.owner === owner)
              .map((a, i) => (
                <li key={i} className="grid gap-1.5 rounded-xl bg-background/60 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-[13px] font-medium text-pretty">{a.title}</span>
                    <Pill className="bg-muted text-muted-foreground normal-case">Effort {a.effort}</Pill>
                    <Pill className={LEVEL_TONE[a.impact]}>{a.impact} impact</Pill>
                  </div>
                  <RequestChips ids={a.entryIds} byId={byId} />
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function Specialists({ report, byId }: { report: DiagnosisReport; byId: ReadonlyMap<number, Entry> }) {
  if (!report.specialists.length) return <Empty>No specialist notes.</Empty>
  return (
    <div>
      {report.specialists.map((s) => {
        const meta = AGENT_META[s.agent]
        return (
          <Collapsible.Root key={s.agent} className="group/spec border-b last:border-b-0">
            <Collapsible.Trigger className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-muted/40 focus-visible:bg-muted">
              <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg', meta.tint)}>
                <meta.icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">{meta.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{s.summary}</span>
              </span>
              <span className="text-2xs text-subtle-foreground tabular">{s.findings.length} findings</span>
              <ChevronRight className="size-4 text-subtle-foreground transition-transform group-data-[state=open]/spec:rotate-90" />
            </Collapsible.Trigger>
            <Collapsible.Content className="flex flex-col gap-3 px-4 pb-4 pl-14">
              {s.findings.map((f, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium">{f.title}</span>
                    <Pill className={SEVERITY_TONE[f.severity].pill}>{f.severity}</Pill>
                  </div>
                  <p className="text-xs text-muted-foreground">{f.detail}</p>
                  <RequestChips ids={f.entryIds} byId={byId} />
                </div>
              ))}
              {!s.findings.length && <p className="text-xs text-muted-foreground">Nothing to report.</p>}
            </Collapsible.Content>
          </Collapsible.Root>
        )
      })}
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">{children}</p>
}

type Tab = 'causes' | 'plan' | 'specialists'

export function FindingsPanel({ report, entries }: { report: DiagnosisReport; entries: readonly Entry[] }) {
  const [tab, setTab] = useState<Tab>('causes')
  const byId = new Map(entries.map((e) => [e.id, e]))
  const icon = tab === 'causes' ? Target : tab === 'plan' ? ListChecks : Users

  return (
    <Panel
      title={tab === 'causes' ? 'Root causes' : tab === 'plan' ? 'Action plan' : 'Specialist notes'}
      icon={icon}
      className="animate-rise"
      aside={
        <SegmentedControl
          type="single"
          value={tab}
          onValueChange={(v) => v && setTab(v as Tab)}
          aria-label="Section"
        >
          <SegmentedItem value="causes">
            Causes <span className="text-subtle-foreground tabular">{report.rootCauses.length}</span>
          </SegmentedItem>
          <SegmentedItem value="plan">
            Plan <span className="text-subtle-foreground tabular">{report.actionPlan.length}</span>
          </SegmentedItem>
          <SegmentedItem value="specialists">
            Agents <span className="text-subtle-foreground tabular">{report.specialists.length}</span>
          </SegmentedItem>
        </SegmentedControl>
      }
    >
      {tab === 'causes' &&
        (report.rootCauses.length ? (
          report.rootCauses.map((f, i) => <RootCause key={i} f={f} n={i + 1} byId={byId} open={i === 0} />)
        ) : (
          <Empty>No significant problems found. This capture looks healthy.</Empty>
        ))}
      {tab === 'plan' && <ActionPlan report={report} byId={byId} />}
      {tab === 'specialists' && <Specialists report={report} byId={byId} />}
    </Panel>
  )
}

export function OpenQuestions({ questions }: { questions: readonly string[] }) {
  if (!questions.length) return null
  return (
    <Panel title="Verify before acting" icon={CircleHelp}>
      <ul className="flex flex-col gap-2 px-4 py-3 text-xs text-muted-foreground">
        {questions.map((q, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-info" />
            <span className="text-pretty">{q}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
