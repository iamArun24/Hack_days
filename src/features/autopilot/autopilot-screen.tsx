import { Check, CircleDashed, KeyRound, LoaderCircle, Minus, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useKeyStatuses, type AutopilotStage, type KeyStatus } from '@/ai'
import { LogoMark } from '@/components/brand'
import { summarize } from '@/har/metrics'
import { cn } from '@/lib/cn'
import { formatNumber } from '@/lib/format'
import { useAppStore } from '@/store'
import type { ViewId } from '@/store/ui-slice'
import { AgentFlow } from '../ai-doctor/agent-flow'
import { useDoctorStore } from '../ai-doctor/doctor-store'
import { cancelAutopilot, sendToBackground, useAutopilotStore } from './autopilot-store'

const finished = (s: AutopilotStage) => s.state === 'done' || s.state === 'failed' || s.state === 'skipped'

/** Ticks while mounted so elapsed times stay live without a store update per second. */
function useNow(interval = 500) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(id)
  }, [interval])
  return now
}

const seconds = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(1)} s`

function ProgressOrb({ ratio, elapsed }: { ratio: number; elapsed: number }) {
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <div className="relative grid size-40 shrink-0 place-items-center">
      <div className="absolute inset-4 rounded-full bg-[radial-gradient(circle,var(--lavender),transparent_70%)] opacity-70 blur-xl motion-safe:animate-breathe" />
      <svg viewBox="0 0 120 120" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <defs>
          <linearGradient id="autopilot-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-lavender)" />
            <stop offset="55%" stopColor="var(--color-peach)" />
            <stop offset="100%" stopColor="var(--color-sage)" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-chart-grid)" strokeWidth="6" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="url(#autopilot-ring)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="relative flex flex-col items-center">
        <span className="font-display text-3xl font-light tabular">{Math.round(ratio * 100)}%</span>
        <span className="font-mono text-[11px] text-muted-foreground tabular">{seconds(elapsed)}</span>
      </div>
    </div>
  )
}

function StageIcon({ state }: { state: AutopilotStage['state'] }) {
  if (state === 'running') return <LoaderCircle className="size-4 text-primary motion-safe:animate-spin" />
  if (state === 'done') return <Check className="size-4 text-success" />
  if (state === 'failed') return <X className="size-4 text-danger" />
  if (state === 'skipped') return <Minus className="size-4 text-subtle-foreground" />
  return <CircleDashed className="size-4 text-subtle-foreground" />
}

function StageTimeline({ stages }: { stages: AutopilotStage[] }) {
  return (
    <ol className="flex flex-col" aria-label="Analysis stages">
      {stages.map((stage, i) => (
        <li key={stage.id} className="relative flex gap-3 pb-4 last:pb-0">
          {i < stages.length - 1 && (
            <span
              aria-hidden
              className={cn(
                'absolute top-7 bottom-0 left-[13px] w-px',
                finished(stage) ? 'bg-primary/40' : 'bg-border-strong',
              )}
            />
          )}
          <span
            className={cn(
              'relative grid size-7 shrink-0 place-items-center rounded-full border bg-panel',
              stage.state === 'running' && 'border-primary/50 shadow-[0_0_0_4px_var(--color-selection)]',
            )}
          >
            <StageIcon state={stage.state} />
          </span>
          <div className="min-w-0 pt-0.5">
            <p
              className={cn('text-[13px] font-medium', stage.state === 'pending' && 'text-muted-foreground')}
            >
              {stage.label}
            </p>
            <p className="truncate text-xs text-muted-foreground" title={stage.detail ?? undefined}>
              {stage.detail ?? (stage.state === 'pending' ? 'Waiting' : '')}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function KeyChip({ status, now }: { status: KeyStatus; now: number }) {
  const label =
    status.state === 'cooling' && status.coolingUntil
      ? `cooling ${Math.max(0, Math.ceil((status.coolingUntil - now) / 1000))}s`
      : status.state
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-panel/80 px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
      <span
        className={cn(
          'size-1.5 rounded-full',
          status.state === 'ready' && 'bg-success',
          status.state === 'busy' && 'bg-primary motion-safe:animate-pulse',
          status.state === 'cooling' && 'bg-warning',
          status.state === 'invalid' && 'bg-danger',
        )}
      />
      Key #{status.index + 1} · {label}
      {status.calls > 0 && <span className="text-subtle-foreground">· {status.calls} calls</span>}
    </span>
  )
}

/** Full-screen view shown right after an upload while the agent pipeline works. */
export function AutopilotScreen() {
  const fileName = useAppStore((s) => s.fileName)
  const entries = useAppStore((s) => s.entries)
  const log = useAppStore((s) => s.log)
  const stages = useAutopilotStore((s) => s.stages)
  const startedAt = useAutopilotStore((s) => s.startedAt)
  const agents = useDoctorStore((s) => s.agents)
  const keys = useKeyStatuses()
  const now = useNow()
  const summary = summarize(entries, log)

  const progress =
    stages.reduce((n, s) => n + (finished(s) ? 1 : s.state === 'running' ? 0.45 : 0), 0) / stages.length
  const done = stages.filter(finished).length

  return (
    <div className="relative h-full overflow-y-auto bg-background" role="status" aria-live="polite">
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 size-[520px] rounded-full bg-(--aurora-1) blur-3xl motion-safe:animate-aurora" />
        <div className="absolute -top-24 right-[-10%] size-[460px] rounded-full bg-(--aurora-2) blur-3xl [animation-delay:-6s] motion-safe:animate-aurora" />
        <div className="absolute bottom-[-30%] left-1/3 size-[560px] rounded-full bg-(--aurora-3) opacity-60 blur-3xl [animation-delay:-11s] motion-safe:animate-aurora" />
      </div>

      <div className="relative mx-auto flex min-h-full max-w-6xl flex-col gap-6 px-5 py-8 md:px-8">
        <header className="flex items-center gap-3">
          <LogoMark className="size-8" />
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-panel/70 px-3 py-1 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase backdrop-blur">
            <Sparkles className="size-3.5 text-primary" /> AI Autopilot
          </span>
        </header>

        <section className="flex flex-col items-center gap-6 rounded-3xl border p-6 shadow-[var(--shadow-lift)] glass md:flex-row md:p-8">
          <ProgressOrb ratio={progress} elapsed={startedAt ? now - startedAt : 0} />
          <div className="min-w-0 flex-1 text-center md:text-left">
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              {done} of {stages.length} stages complete
            </p>
            <h1 className="mt-2 font-display text-[clamp(1.6rem,3.2vw,2.5rem)] leading-tight font-light tracking-tight text-balance">
              Analysing <span className="font-normal break-all text-primary">{fileName}</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-pretty text-muted-foreground">
              Specialist agents are reading a redacted digest of this capture on Groq. When they finish, the
              app opens on the AI analysis with the report, the key requests already explained, and views
              worth checking.
            </p>
            <dl className="mt-4 flex flex-wrap justify-center gap-2 md:justify-start">
              {[
                ['Requests', formatNumber(summary.requests)],
                ['Domains', formatNumber(summary.domains)],
                ['Errors', formatNumber(summary.errors)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border bg-panel/80 px-3 py-1.5">
                  <dt className="text-[11px] text-muted-foreground">{label}</dt>
                  <dd
                    className={cn(
                      'font-display text-lg tabular',
                      label === 'Errors' && summary.errors > 0 && 'text-danger',
                    )}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <section className="rounded-3xl border p-5 shadow-[var(--shadow-soft)] glass">
            <h2 className="mb-4 text-[13px] font-semibold">Agents</h2>
            <AgentFlow agents={agents} />
          </section>
          <aside className="flex flex-col gap-5 rounded-3xl border p-5 shadow-[var(--shadow-soft)] glass">
            <div>
              <h2 className="mb-4 text-[13px] font-semibold">Pipeline</h2>
              <StageTimeline stages={stages} />
            </div>
            {keys.length > 0 && (
              <div>
                <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
                  <KeyRound className="size-3.5 text-muted-foreground" /> Key pool
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {keys.map((k) => (
                    <KeyChip key={k.index} status={k} now={now} />
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>

        <footer className="mt-auto flex flex-wrap items-center justify-center gap-3 pb-2">
          <button
            type="button"
            onClick={sendToBackground}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground shadow-[var(--shadow-soft)] outline-none hover:shadow-[var(--shadow-lift)] focus-visible:ring-4 focus-visible:ring-ring/30 active:scale-95"
          >
            Open the app now
            <span className="text-primary-foreground/70">· AI keeps working</span>
          </button>
          <button
            type="button"
            onClick={cancelAutopilot}
            className="inline-flex h-11 items-center gap-2 rounded-full border bg-panel/70 px-5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30"
          >
            <X className="size-4" /> Cancel AI
          </button>
        </footer>
      </div>
    </div>
  )
}

/** Floating progress pill while the pipeline runs behind the app. */
export function AutopilotPill() {
  const status = useAutopilotStore((s) => s.status)
  const foreground = useAutopilotStore((s) => s.foreground)
  const stages = useAutopilotStore((s) => s.stages)
  if (status !== 'running' || foreground) return null
  const done = stages.filter(finished).length
  const running = stages.find((s) => s.state === 'running')

  return (
    <button
      type="button"
      onClick={() => useAppStore.getState().setView('doctor' as ViewId)}
      className="fixed right-4 bottom-12 z-50 inline-flex max-w-[min(22rem,calc(100vw-2rem))] animate-rise items-center gap-2.5 rounded-full border py-2 pr-4 pl-2.5 text-xs shadow-[var(--shadow-lift)] glass outline-none hover:border-primary/40 focus-visible:ring-4 focus-visible:ring-ring/30"
      aria-label={`AI working, ${done} of ${stages.length} stages done`}
    >
      <span className="grid size-7 place-items-center rounded-full bg-primary/12">
        <Sparkles className="size-3.5 text-primary motion-safe:animate-pulse" />
      </span>
      <span className="flex min-w-0 flex-col items-start leading-tight">
        <span className="font-medium">
          AI working… {done}/{stages.length}
        </span>
        {running && <span className="truncate text-muted-foreground">{running.detail ?? running.label}</span>}
      </span>
    </button>
  )
}
