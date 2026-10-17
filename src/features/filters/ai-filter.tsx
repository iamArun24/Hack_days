import { CornerDownLeft, LoaderCircle, Sparkles, Undo2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { create } from 'zustand'
import { AiError, aiReady, nlToFilter, type NlFilterResult } from '@/ai'
import { Button } from '@/components/ui/button'
import { InputGroup } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import type { FilterCriteria } from '@/har/filter'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/store'
import { selectCriteria, selectFacets } from '@/store/selectors'
import { FOCUS_AI_FILTER_EVENT, openAiSettings } from '../ai-settings/events'

const EXAMPLES = [
  'failed API calls slower than 500 ms',
  'POST requests to the api domain',
  'images bigger than 200 KB',
  'requests whose body mentions "token"',
]

interface AiFilterState {
  /** Last applied AI filter, kept so the chip survives view switches. */
  applied: { prompt: string; explanation: string; previous: FilterCriteria } | null
  setApplied: (applied: AiFilterState['applied']) => void
}

const useAiFilter = create<AiFilterState>()((set) => ({
  applied: null,
  setApplied: (applied) => set({ applied }),
}))

/** Keeps only the fields the model actually set, with basic shape checks. */
function cleanCriteria(criteria: NlFilterResult['criteria']): Partial<FilterCriteria> {
  const out: Partial<FilterCriteria> = {}
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null)
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
  if (typeof criteria.query === 'string') out.query = criteria.query
  if (typeof criteria.useRegex === 'boolean') out.useRegex = criteria.useRegex
  if (typeof criteria.negate === 'boolean') out.negate = criteria.negate
  if (criteria.scope && ['url', 'headers', 'body', 'all'].includes(criteria.scope)) out.scope = criteria.scope
  for (const kind of ['methods', 'statuses', 'types', 'domains'] as const) {
    const values = list(criteria[kind])
    if (values?.length) out[kind] = values
  }
  for (const key of ['minTime', 'maxTime', 'minSize', 'maxSize'] as const) {
    const value = num(criteria[key])
    if (value !== null) out[key] = value
  }
  return out
}

function applyAiCriteria(prompt: string, result: NlFilterResult) {
  const store = useAppStore.getState()
  const previous = selectCriteria(store)
  store.resetFilters()
  store.applyCriteria(cleanCriteria(result.criteria))
  useAiFilter.getState().setApplied({ prompt, explanation: result.explanation, previous })
}

function undoAiFilter() {
  const applied = useAiFilter.getState().applied
  if (!applied) return
  const store = useAppStore.getState()
  store.resetFilters()
  store.applyCriteria(applied.previous)
  useAiFilter.getState().setApplied(null)
}

/** Plain-English filter input: Enter turns the sentence into real filter criteria. */
export function AiFilterField({ className, onExit }: { className?: string; onExit: () => void }) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [example] = useState(() => EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]!)
  const abort = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => () => abort.current?.abort(), [])

  // Palette command / Ctrl+I while already in AI mode: just focus.
  useEffect(() => {
    const onFocus = () => input.current?.focus()
    addEventListener(FOCUS_AI_FILTER_EVENT, onFocus)
    return () => removeEventListener(FOCUS_AI_FILTER_EVENT, onFocus)
  }, [])

  const submit = async () => {
    const text = draft.trim()
    if (!text || busy) return
    if (!aiReady()) {
      toast('Set up AI first', { description: 'Add a Groq key and accept the privacy note.' })
      openAiSettings()
      return
    }
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setBusy(true)
    try {
      const result = await nlToFilter(text, selectFacets(useAppStore.getState()), controller.signal)
      applyAiCriteria(text, result)
      setDraft('')
    } catch (error) {
      if (controller.signal.aborted) return
      if (error instanceof AiError && (error.code === 'no-keys' || error.code === 'consent')) {
        openAiSettings()
        return
      }
      toast.error('AI filter failed', { description: error instanceof Error ? error.message : String(error) })
    } finally {
      if (abort.current === controller) setBusy(false)
    }
  }

  return (
    <InputGroup
      className={cn(
        'relative overflow-hidden border-primary/40 bg-gradient-to-r from-lavender/15 via-panel to-peach/10',
        className,
      )}
      leading={
        busy ? (
          <LoaderCircle className="animate-spin text-primary" />
        ) : (
          <Sparkles className="text-primary" aria-hidden />
        )
      }
      trailing={
        <>
          {!busy && draft && (
            <Kbd className="hidden sm:inline-flex">
              <CornerDownLeft className="size-3" />
            </Kbd>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              abort.current?.abort()
              setBusy(false)
              onExit()
            }}
            aria-label="Back to normal search"
          >
            <X />
          </Button>
        </>
      }
    >
      {busy && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-shimmer bg-[linear-gradient(100deg,transparent_20%,color-mix(in_oklab,var(--color-lavender)_35%,transparent)_50%,transparent_80%)] bg-[length:200%_100%]"
        />
      )}
      <input
        ref={input}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void submit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            if (busy) abort.current?.abort()
            else onExit()
          }
        }}
        disabled={busy}
        placeholder={`Try: "${example}"`}
        aria-label="Describe the requests you want to see"
        autoComplete="off"
        spellCheck={false}
      />
    </InputGroup>
  )
}

/** "✨ explanation" chip shown after an AI filter is applied, with undo. */
export function AiFilterChip() {
  const applied = useAiFilter((s) => s.applied)
  if (!applied) return null
  return (
    <div className="flex animate-rise items-center gap-2 self-start rounded-full border border-primary/25 bg-gradient-to-r from-lavender/20 to-peach/15 py-0.5 pr-1 pl-2.5 text-xs">
      <Sparkles className="size-3.5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 truncate" title={`"${applied.prompt}"`}>
        {applied.explanation}
      </span>
      <Button variant="ghost" size="xs" className="rounded-full" onClick={undoAiFilter}>
        <Undo2 /> Undo
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className="rounded-full"
        onClick={() => useAiFilter.getState().setApplied(null)}
        aria-label="Dismiss AI filter note"
      >
        <X />
      </Button>
    </div>
  )
}
