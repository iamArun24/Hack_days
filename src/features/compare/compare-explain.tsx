import { TrendingDown, TrendingUp, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { explainComparison, previewPayload, type CompareExplanation } from '@/ai'
import { AiButton, AiError, AiResultCard, AiThinking, WhatIsSent } from '@/components/ai/ai-kit'
import { useAiTask } from '@/components/ai/ai-task'
import type { Entry } from '@/har/types'
import { cn } from '@/lib/cn'

/** Last answer per comparison file, so switching views and back keeps it. */
const cache = new Map<string, { data: CompareExplanation; ms: number }>()

function toText(e: CompareExplanation): string {
  const list = (title: string, items: CompareExplanation['regressions']) =>
    items.length ? `\n${title}\n${items.map((i) => `- ${i.title}: ${i.detail}`).join('\n')}` : ''
  return [
    e.headline,
    list('Regressions', e.regressions),
    list('Improvements', e.improvements),
    `\nLikely cause\n${e.likelyCause}`,
  ].join('\n')
}

function Column({
  title,
  icon,
  tone,
  items,
}: {
  title: string
  icon: ReactNode
  tone: string
  items: CompareExplanation['regressions']
}) {
  return (
    <div className="min-w-0">
      <h4 className={cn('mb-2 flex items-center gap-1.5 text-xs font-semibold [&_svg]:size-3.5', tone)}>
        {icon}
        {title} <span className="font-normal text-subtle-foreground tabular">{items.length}</span>
      </h4>
      {items.length === 0 ? (
        <p className="text-xs text-subtle-foreground">None found.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item, i) => (
            <li key={i} className="rounded-xl border bg-background/50 px-3 py-2">
              <p className="text-xs font-medium">{item.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** "Explain with AI": turns the numeric diff into a narrative — what regressed, what improved, why. */
export function CompareExplain({
  base,
  other,
  cacheKey,
}: {
  base: readonly Entry[]
  other: readonly Entry[]
  cacheKey: string
}) {
  const { state, run, cancel, reset } = useAiTask<CompareExplanation>(cache.get(cacheKey))

  const explain = async () => {
    const startedAt = performance.now()
    const data = await run((signal) => explainComparison(base, other, signal))
    if (data) cache.set(cacheKey, { data, ms: performance.now() - startedAt })
  }

  const close = () => {
    cache.delete(cacheKey)
    reset()
  }

  if (state.status === 'idle') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <AiButton onClick={() => void explain()}>Explain with AI</AiButton>
        <span className="text-[11px] text-subtle-foreground">
          What got slower or faster, and the likely reason
        </span>
        <WhatIsSent payload={() => previewPayload('compare', other)} className="basis-full" />
      </div>
    )
  }
  if (state.status === 'running') return <AiThinking label="Comparing both captures…" onCancel={cancel} />
  if (state.status === 'error') {
    return (
      <AiError
        message={state.message}
        onRetry={() => void explain()}
        needsSetup={state.code === 'no-keys' || state.code === 'consent' || state.code === 'invalid-key'}
      />
    )
  }

  const { data } = state
  return (
    <AiResultCard
      title="What changed"
      ms={state.ms}
      copyText={() => toText(data)}
      onRegenerate={() => void explain()}
      onClose={close}
    >
      <p className="text-[13px] leading-relaxed">{data.headline}</p>
      <div className="mt-3 grid gap-4 @3xl:grid-cols-2">
        <Column title="Regressions" icon={<TrendingDown />} tone="text-danger" items={data.regressions} />
        <Column title="Improvements" icon={<TrendingUp />} tone="text-success" items={data.improvements} />
      </div>
      <div className="mt-3 rounded-xl border border-primary/20 bg-lavender/15 px-3 py-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary uppercase">
          <Search className="size-3" /> Likely cause
        </p>
        <p className="mt-1 text-xs leading-relaxed">{data.likelyCause}</p>
      </div>
    </AiResultCard>
  )
}
