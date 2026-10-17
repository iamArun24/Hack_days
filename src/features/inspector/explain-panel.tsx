import { CircleAlert, CircleCheck, Lightbulb, ListChecks, OctagonAlert, Wrench } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { explainCache as cache, explainRequest, previewPayload, type RequestExplanation } from '@/ai'
import { AiButton, AiError, AiResultCard, AiThinking, WhatIsSent } from '@/components/ai/ai-kit'
import { useAiTask } from '@/components/ai/ai-task'
import { CodeBlock } from '@/components/code-block'
import type { Entry } from '@/har/types'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/store'

const TONE: Record<RequestExplanation['status'], { icon: typeof CircleCheck; className: string }> = {
  ok: { icon: CircleCheck, className: 'text-success bg-sage/25 border-success/25' },
  warning: { icon: CircleAlert, className: 'text-warning bg-butter/30 border-warning/25' },
  error: { icon: OctagonAlert, className: 'text-danger bg-blush/25 border-danger/25' },
}

function toText(e: RequestExplanation): string {
  const list = (title: string, items: string[]) =>
    items.length ? `\n${title}\n${items.map((i) => `- ${i}`).join('\n')}` : ''
  return [
    e.verdict,
    list('What happened', e.whatHappened),
    list('Likely causes', e.likelyCauses),
    list('Fixes', e.fixes),
    e.correctedCurl ? `\nCorrected request\n${e.correctedCurl}` : '',
  ].join('\n')
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="mt-3">
      <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase [&_svg]:size-3.5">
        {icon}
        {title}
      </h4>
      {children}
    </div>
  )
}

function Explanation({ data }: { data: RequestExplanation }) {
  const tone = TONE[data.status]
  const [done, setDone] = useState<ReadonlySet<number>>(new Set())
  const toggle = (i: number) =>
    setDone((d) => {
      const next = new Set(d)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  return (
    <div className="text-[13px]">
      <p className={cn('flex items-start gap-2 rounded-xl border px-3 py-2 font-medium', tone.className)}>
        <tone.icon className="mt-0.5 size-4 shrink-0" />
        <span className="text-foreground">{data.verdict}</span>
      </p>

      {data.whatHappened.length > 0 && (
        <Section icon={<ListChecks />} title="What happened">
          <ol className="flex flex-col gap-1">
            {data.whatHappened.map((step, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed">
                <span className="grid size-4 shrink-0 place-items-center rounded-full bg-lavender/40 font-mono text-[10px] text-primary">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {data.likelyCauses.length > 0 && (
        <Section icon={<Lightbulb />} title="Likely causes">
          <ul className="flex flex-col gap-1 text-xs leading-relaxed">
            {data.likelyCauses.map((cause, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-peach" />
                {cause}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.fixes.length > 0 && (
        <Section icon={<Wrench />} title="Fixes">
          <ul className="flex flex-col gap-1">
            {data.fixes.map((fix, i) => (
              <li key={i}>
                <label className="flex cursor-default items-start gap-2 rounded-lg px-1 py-0.5 text-xs leading-relaxed hover:bg-muted/50">
                  <input
                    type="checkbox"
                    checked={done.has(i)}
                    onChange={() => toggle(i)}
                    className="mt-0.5 accent-[var(--primary)]"
                  />
                  <span className={cn(done.has(i) && 'text-muted-foreground line-through')}>{fix}</span>
                </label>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.correctedCurl && (
        <Section icon={<Wrench />} title="Corrected request">
          <CodeBlock content={data.correctedCurl} className="mx-0" />
        </Section>
      )}
    </div>
  )
}

/** "Explain & fix" for the inspected request: a collapsible AI panel above the inspector tabs. */
export function ExplainPanel({ entry }: { entry: Entry }) {
  // Shared with the autopilot: answers it pre-computed open here instantly.
  const cached = cache.get(entry.id)
  const { state, run, cancel, reset } = useAiTask<RequestExplanation>(cached)
  const [open, setOpen] = useState(cached !== undefined)

  const explain = async () => {
    setOpen(true)
    const entries = useAppStore.getState().entries
    const startedAt = performance.now()
    const data = await run((signal) => explainRequest(entry, entries, signal))
    if (data) cache.set(entry.id, { data, ms: performance.now() - startedAt })
  }

  const close = () => {
    cancel()
    reset()
    setOpen(false)
  }

  const payload = () => previewPayload('explain', useAppStore.getState().entries, entry)

  return (
    <div className="shrink-0 border-b px-4 py-2">
      {!open ? (
        <div className="flex items-center gap-2">
          <AiButton onClick={() => void explain()}>Explain &amp; fix</AiButton>
          <span className="truncate text-[11px] text-subtle-foreground">
            What happened, why, and how to fix it
          </span>
        </div>
      ) : (
        <div className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto py-1">
          {state.status === 'running' && (
            <AiThinking label="Reading headers, timings and body…" onCancel={close} />
          )}
          {state.status === 'error' && (
            <AiError
              message={state.message}
              onRetry={() => void explain()}
              needsSetup={
                state.code === 'no-keys' || state.code === 'consent' || state.code === 'invalid-key'
              }
            />
          )}
          {state.status === 'done' && (
            <AiResultCard
              title="Explain & fix"
              ms={state.ms}
              copyText={() => toText(state.data)}
              onRegenerate={() => void explain()}
              onClose={close}
            >
              <Explanation data={state.data} />
            </AiResultCard>
          )}
          {state.status !== 'done' && state.status !== 'running' && (
            <button
              type="button"
              onClick={close}
              className="self-start text-[11px] text-subtle-foreground hover:text-foreground"
            >
              Hide
            </button>
          )}
          <WhatIsSent payload={payload} />
        </div>
      )}
    </div>
  )
}
