import {
  ArrowUpRight,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Copy,
  Download,
  Eye,
  FileCode2,
  Filter,
  LoaderCircle,
  MessageSquareText,
  MousePointerClick,
  OctagonAlert,
  SkipForward,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import { Collapsible } from 'radix-ui'
import {
  explainCache,
  type AutopilotStage,
  type NlFilterResult,
  type RequestExplanation,
  type SuggestedView,
} from '@/ai'
import { MethodLabel } from '@/components/http-labels'
import { Tooltip } from '@/components/ui/tooltip'
import type { FilterCriteria } from '@/har/filter'
import type { Entry } from '@/har/types'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/cn'
import { downloadText } from '@/lib/download'
import { useAppStore } from '@/store'
import { Panel } from './report-view'

/* ─── Live autopilot progress ─── */

const STAGE_ICON: Record<AutopilotStage['state'], { icon: LucideIcon; className: string }> = {
  pending: { icon: CircleDashed, className: 'text-subtle-foreground' },
  running: { icon: LoaderCircle, className: 'animate-spin text-primary' },
  done: { icon: CircleCheck, className: 'text-success' },
  failed: { icon: CircleAlert, className: 'text-danger' },
  skipped: { icon: SkipForward, className: 'text-subtle-foreground' },
}

export function AutopilotTimeline({ stages }: { stages: readonly AutopilotStage[] }) {
  const done = stages.filter((s) => s.state === 'done' || s.state === 'skipped').length
  return (
    <Panel
      title="Autopilot pipeline"
      icon={Wand2}
      aside={
        <span className="font-mono text-2xs text-muted-foreground tabular">
          {done}/{stages.length}
        </span>
      }
    >
      <div className="px-4 pt-3">
        <div className="h-1 overflow-hidden rounded-full bg-chart-grid">
          <div
            className="h-full rounded-full bg-gradient-to-r from-lavender via-primary to-sage transition-[width] duration-700"
            style={{ width: `${stages.length ? (done / stages.length) * 100 : 0}%` }}
          />
        </div>
      </div>
      <ol className="flex flex-col px-2 py-2">
        {stages.map((stage) => {
          const { icon: Icon, className } = STAGE_ICON[stage.state]
          return (
            <li
              key={stage.id}
              className={cn(
                'flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors',
                stage.state === 'running' && 'bg-selection',
                stage.state === 'pending' && 'opacity-55',
              )}
            >
              <Icon className={cn('mt-0.5 size-4 shrink-0', className)} />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium">{stage.label}</span>
                <span className="block truncate text-2xs text-muted-foreground">
                  {stage.detail ?? (stage.state === 'pending' ? 'Waiting' : '')}
                </span>
              </span>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}

/* ─── Quick actions ─── */

const focusAiFilter = () => {
  useAppStore.getState().setView('requests')
  // Give the requests view a frame to mount its toolbar before it listens for the event.
  setTimeout(() => window.dispatchEvent(new CustomEvent('har:focus-ai-filter')), 120)
}

function ActionRow({
  icon: Icon,
  title,
  hint,
  onClick,
  disabled,
}: {
  icon: LucideIcon
  title: string
  hint: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted disabled:pointer-events-none disabled:opacity-45"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-lavender/55 to-sky/35">
        <Icon className="size-4 text-foreground/80" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium">{title}</span>
        <span className="block truncate text-2xs text-muted-foreground">{hint}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-subtle-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

export function QuickActions({
  onCopyReport,
  openapi,
  fileBase,
}: {
  onCopyReport: (() => void) | null
  openapi: string | null
  fileBase: string
}) {
  const setView = useAppStore((s) => s.setView)
  return (
    <Panel title="AI tools" icon={Wand2}>
      <div className="divide-y py-1">
        <ActionRow
          icon={MessageSquareText}
          title="Ask the capture"
          hint='Filter in plain English: "slow failed API calls"'
          onClick={focusAiFilter}
        />
        <ActionRow
          icon={MousePointerClick}
          title="Explain a request"
          hint="Open any request, then press Explain & fix"
          onClick={() => setView('requests')}
        />
        <ActionRow
          icon={FileCode2}
          title={openapi ? 'Download OpenAPI spec' : 'Generate OpenAPI spec'}
          hint={openapi ? 'Drafted by the autopilot' : 'Draft one from the Endpoints view'}
          onClick={
            openapi
              ? () => downloadText(openapi, `${fileBase}-openapi.yaml`, 'application/yaml')
              : () => setView('endpoints')
          }
        />
        <ActionRow
          icon={Copy}
          title="Copy report"
          hint="Ticket-ready Markdown with request URLs"
          onClick={onCopyReport ?? undefined}
          disabled={!onCopyReport}
        />
      </div>
    </Panel>
  )
}

/* ─── Requests the AI explained ─── */

const TONE: Record<RequestExplanation['status'], { icon: LucideIcon; className: string }> = {
  ok: { icon: CircleCheck, className: 'text-success' },
  warning: { icon: CircleAlert, className: 'text-warning' },
  error: { icon: OctagonAlert, className: 'text-danger' },
}

export function ExplainedRequests({ ids, entries }: { ids: readonly number[]; entries: readonly Entry[] }) {
  const inspect = useAppStore((s) => s.inspect)
  const byId = new Map(entries.map((e) => [e.id, e]))
  const items = ids
    .map((id) => ({ entry: byId.get(id), cached: explainCache.get(id) }))
    .filter((x): x is { entry: Entry; cached: NonNullable<typeof x.cached> } => !!x.entry && !!x.cached)
  if (!items.length) return null

  return (
    <Panel
      title="Requests explained"
      icon={MessageSquareText}
      aside={<span className="text-2xs text-muted-foreground tabular">{items.length}</span>}
    >
      <ul className="divide-y py-1">
        {items.map(({ entry, cached }) => {
          const tone = TONE[cached.data.status]
          return (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => inspect(entry.id)}
                className="group flex w-full items-start gap-3 px-4 py-2.5 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted"
              >
                <tone.icon className={cn('mt-0.5 size-4 shrink-0', tone.className)} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-mono text-2xs">
                    <span className="text-subtle-foreground">#{entry.id}</span>
                    <MethodLabel method={entry.method} className="text-2xs" />
                    <span className="truncate text-muted-foreground" title={entry.url}>
                      {entry.path}
                    </span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-pretty">{cached.data.verdict}</span>
                </span>
                <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-subtle-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

/* ─── Suggested views ─── */

const FACETS = ['methods', 'statuses', 'types', 'domains'] as const
const RANGES = ['minTime', 'maxTime', 'minSize', 'maxSize'] as const

function cleanCriteria(c: NlFilterResult['criteria']): Partial<FilterCriteria> {
  const out: Partial<FilterCriteria> = {}
  if (typeof c.query === 'string' && c.query) out.query = c.query
  if (typeof c.useRegex === 'boolean') out.useRegex = c.useRegex
  if (typeof c.negate === 'boolean') out.negate = c.negate
  if (c.scope) out.scope = c.scope
  for (const kind of FACETS) {
    const values = c[kind]
    if (Array.isArray(values) && values.length) out[kind] = values.filter((v) => typeof v === 'string')
  }
  for (const key of RANGES) {
    const value = c[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) out[key] = value
  }
  return out
}

function applySuggestion(view: SuggestedView): void {
  const store = useAppStore.getState()
  store.resetFilters()
  store.applyCriteria(cleanCriteria(view.criteria))
  store.setView('requests')
}

export function SuggestedViews({ views }: { views: readonly SuggestedView[] }) {
  if (!views.length) return null
  return (
    <Panel title="Suggested views" icon={Filter}>
      <div className="flex flex-wrap gap-1.5 px-4 py-3">
        {views.map((view, i) => (
          <Tooltip key={`${view.label}-${i}`} content={view.reason} side="bottom">
            <button
              type="button"
              onClick={() => applySuggestion(view)}
              className="inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-2.5 py-1 text-xs outline-none hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <Filter className="size-3 text-primary" />
              {view.label}
            </button>
          </Tooltip>
        ))}
      </div>
    </Panel>
  )
}

/* ─── API spec draft ─── */

export function ApiSpecDraft({ yaml, fileBase }: { yaml: string; fileBase: string }) {
  const lines = yaml.split('\n').length
  return (
    <Panel
      title="API spec draft"
      icon={FileCode2}
      aside={<span className="font-mono text-2xs text-muted-foreground">{lines} lines</span>}
    >
      <Collapsible.Root className="group/yaml">
        <div className="flex items-center gap-1.5 px-4 py-3">
          <Collapsible.Trigger className="inline-flex items-center gap-1.5 rounded-lg border bg-background/70 px-2.5 py-1 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40">
            <Eye className="size-3.5" /> Preview
          </Collapsible.Trigger>
          <button
            type="button"
            onClick={() => void copyText(yaml, 'OpenAPI spec copied')}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-background/70 px-2.5 py-1 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Copy className="size-3.5" /> Copy
          </button>
          <button
            type="button"
            onClick={() => downloadText(yaml, `${fileBase}-openapi.yaml`, 'application/yaml')}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-background/70 px-2.5 py-1 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Download className="size-3.5" /> .yaml
          </button>
        </div>
        <Collapsible.Content>
          <pre className="max-h-80 overflow-auto border-t px-4 py-3 font-mono text-2xs leading-relaxed text-foreground/85">
            {yaml}
          </pre>
        </Collapsible.Content>
      </Collapsible.Root>
    </Panel>
  )
}
