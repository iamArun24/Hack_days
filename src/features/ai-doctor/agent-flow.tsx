import { CircleAlert, CircleCheck, LoaderCircle, Timer } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatDuration, formatNumber } from '@/lib/format'
import { AGENT_META } from './agent-meta'
import type { AgentKey, AgentState } from './doctor-store'

const SPECIALISTS = ['performance', 'reliability', 'security', 'api'] as const

function StageIcon({ stage }: { stage: AgentState['stage'] }) {
  if (stage === 'running')
    return <LoaderCircle className="size-4 animate-spin text-primary" aria-label="Running" />
  if (stage === 'done') return <CircleCheck className="size-4 text-success" aria-label="Done" />
  if (stage === 'failed') return <CircleAlert className="size-4 text-danger" aria-label="Failed" />
  return <Timer className="size-4 text-subtle-foreground" aria-label="Queued" />
}

function AgentCard({ id, state, wide }: { id: AgentKey; state: AgentState; wide?: boolean }) {
  const meta = AGENT_META[id]
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border p-3.5 shadow-[var(--shadow-soft)] glass transition-all duration-500',
        state.stage === 'running' && 'border-primary/40 shadow-[var(--shadow-lift)]',
        state.stage === 'failed' && 'border-danger/40',
        state.stage === 'queued' && 'opacity-75',
        wide && 'mx-auto w-full max-w-md',
      )}
    >
      {state.stage === 'running' && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5 animate-shimmer bg-[linear-gradient(90deg,transparent,var(--color-primary),transparent)] bg-[length:200%_100%]"
        />
      )}
      <div className="flex items-center gap-2.5">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', meta.tint)}>
          <meta.icon className="size-4.5 text-foreground/80" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{meta.label}</p>
          <p className="truncate text-2xs text-muted-foreground">{meta.role}</p>
        </div>
        <StageIcon stage={state.stage} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 font-mono text-2xs text-muted-foreground">
        <span className="rounded-md bg-muted/70 px-1.5 py-0.5">{state.model ?? 'waiting…'}</span>
        {state.keyIndex !== undefined && (
          <span className="rounded-md bg-muted/70 px-1.5 py-0.5">Key #{state.keyIndex + 1}</span>
        )}
        {state.ms !== undefined && (
          <span className="rounded-md bg-muted/70 px-1.5 py-0.5">{formatDuration(state.ms)}</span>
        )}
        {state.tokens !== undefined && (
          <span className="rounded-md bg-muted/70 px-1.5 py-0.5">{formatNumber(state.tokens)} tok</span>
        )}
      </div>
      {state.error && <p className="mt-2 line-clamp-2 text-2xs text-danger">{state.error}</p>}
    </div>
  )
}

/** Four specialists fan into the lead agent; a flow animates along each finished or running link. */
export function AgentFlow({ agents }: { agents: Record<AgentKey, AgentState> }) {
  const xs = [12.5, 37.5, 62.5, 87.5]
  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SPECIALISTS.map((id) => (
          <AgentCard key={id} id={id} state={agents[id]} />
        ))}
      </div>
      <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-14 w-full" aria-hidden>
        {SPECIALISTS.map((id, i) => {
          const stage = agents[id].stage
          const live = stage === 'running' || stage === 'done'
          const d = `M ${xs[i]} 0 C ${xs[i]} 12, 50 10, 50 24`
          return (
            <g key={id}>
              <path
                d={d}
                fill="none"
                stroke="var(--color-border-strong)"
                strokeWidth="0.35"
                vectorEffect="non-scaling-stroke"
              />
              {live && (
                <path
                  d={d}
                  fill="none"
                  stroke={stage === 'done' ? 'var(--color-primary)' : 'var(--color-lavender)'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="4 7"
                  vectorEffect="non-scaling-stroke"
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from="22"
                    to="0"
                    dur="0.9s"
                    repeatCount="indefinite"
                  />
                </path>
              )}
            </g>
          )
        })}
      </svg>
      <AgentCard id="lead" state={agents.lead} wide />
    </div>
  )
}
