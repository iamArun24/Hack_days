import { Bot, CircleCheck, KeyRound, ShieldCheck, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAiSettings } from '@/ai'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/cn'
import { openAiSettings, parseKeys } from './events'
import { STATUS_DOT, useAiStatus, useAutopilot } from './use-ai-status'

const PIPELINE = ['4 specialists', 'Lead agent', 'Explained requests', 'Suggested views', 'OpenAPI']

/** Accessible on/off switch in the Lumen palette. */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (on: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30',
        checked ? 'border-primary/40 bg-primary' : 'border-border-strong bg-muted',
      )}
    >
      <span
        className={cn(
          'size-3.5 rounded-full bg-white shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  )
}

/**
 * The "AI Autopilot" card shown next to every upload surface: explains the agentic flow, and
 * lets people paste Groq keys + give consent inline without opening the full settings dialog.
 */
export function AiQuickSetup({ className }: { className?: string }) {
  const { status, keys } = useAiStatus()
  const consent = useAiSettings((s) => s.consent)
  const storedKeys = useAiSettings((s) => s.keys)
  const setKeys = useAiSettings((s) => s.setKeys)
  const setConsent = useAiSettings((s) => s.setConsent)
  const [autopilot, setAutopilot] = useAutopilot()
  const [draft, setDraft] = useState('')
  const [agree, setAgree] = useState(consent)

  const pasted = parseKeys(draft)
  const canSave = (pasted.length > 0 || keys > 0) && agree

  const save = () => {
    if (!canSave) return
    if (pasted.length) setKeys([...new Set([...storedKeys, ...pasted])])
    setConsent(true)
    setAutopilot(true)
    setDraft('')
    toast.success('AI Autopilot is on', {
      description: 'Drop a HAR file and the agents will analyse it automatically.',
    })
  }

  return (
    <div
      data-no-burst
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'relative w-full overflow-hidden rounded-[1.5rem] border border-white/50 p-5 text-left shadow-[var(--shadow-soft)] glass dark:border-white/10',
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -right-16 size-48 rounded-full bg-gradient-to-br from-lavender/50 via-peach/30 to-transparent blur-2xl"
      />
      <div className="relative flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-lavender via-peach to-sage shadow-[var(--shadow-soft)]">
          <Bot className="size-5 text-white drop-shadow" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold">
            AI Autopilot
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <span className={cn('size-1.5 rounded-full', STATUS_DOT[status])} />
              {status === 'ready'
                ? autopilot
                  ? 'On'
                  : 'Paused'
                : status === 'consent'
                  ? 'Needs consent'
                  : 'Off'}
            </span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Drop a HAR and four specialist agents plus a lead agent analyse it automatically on Groq. You land
            straight on the AI report.
          </p>
        </div>
      </div>

      <ol className="relative mt-3 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
        {PIPELINE.map((step, i) => (
          <li key={step} className="flex items-center gap-1">
            <span className="rounded-full border bg-background/60 px-2 py-0.5">{step}</span>
            {i < PIPELINE.length - 1 && <span className="text-subtle-foreground">→</span>}
          </li>
        ))}
      </ol>

      {status === 'ready' ? (
        <div className="relative mt-4 flex flex-wrap items-center gap-3 rounded-xl border bg-background/50 px-3 py-2.5">
          <CircleCheck className="size-4 shrink-0 text-success" />
          <span className="min-w-0 flex-1 text-xs">
            <span className="font-medium">
              {autopilot ? 'AI Autopilot on' : 'AI ready, autopilot paused'}
            </span>
            <span className="text-muted-foreground">
              {' '}
              · {keys} key{keys === 1 ? '' : 's'}
            </span>
          </span>
          <Switch checked={autopilot} onChange={setAutopilot} label="Analyse uploads automatically" />
          <button
            type="button"
            onClick={openAiSettings}
            className="text-xs text-primary underline-offset-4 outline-none hover:underline focus-visible:underline"
          >
            Manage keys
          </button>
        </div>
      ) : (
        <form
          className="relative mt-4 flex flex-col gap-2.5"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          {keys === 0 && (
            <label className="flex flex-col gap-1">
              <span className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <KeyRound className="size-3" /> Groq API keys (several = faster, parallel agents)
                </span>
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Get a free key
                </a>
              </span>
              <input
                type="password"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="gsk_…, gsk_…"
                autoComplete="off"
                spellCheck={false}
                className="h-9 w-full rounded-lg border border-input bg-panel px-3 font-mono text-xs outline-none placeholder:text-subtle-foreground focus:border-ring focus:ring-3 focus:ring-ring/20"
              />
            </label>
          )}
          <label className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
            <span>
              <ShieldCheck className="mr-1 inline size-3 text-success" />
              Send only a redacted digest to Groq (tokens, cookies and emails masked). Keys stay in this
              browser.
            </span>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!canSave}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground shadow-[var(--shadow-soft)] outline-none hover:brightness-105 focus-visible:ring-4 focus-visible:ring-ring/30 active:scale-95 disabled:opacity-50"
            >
              <Sparkles className="size-3.5" /> Save &amp; enable
            </button>
            <button
              type="button"
              onClick={openAiSettings}
              className="text-xs text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline"
            >
              {keys ? `${keys} key${keys === 1 ? '' : 's'} saved · Manage` : 'More options'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

/** Header pill: live AI status, opens the settings dialog. */
export function AiStatusPill({ className }: { className?: string }) {
  const { status, keys } = useAiStatus()
  return (
    <button
      type="button"
      onClick={openAiSettings}
      data-cursor="hover"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border bg-panel/70 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40',
        className,
      )}
    >
      <Sparkles className="size-3.5 text-primary" />
      <span className="hidden sm:inline">
        {status === 'ready'
          ? `AI ready · ${keys} key${keys === 1 ? '' : 's'}`
          : status === 'consent'
            ? 'AI · consent needed'
            : 'Add Groq keys'}
      </span>
      <span
        className={cn('size-1.5 rounded-full', STATUS_DOT[status], status === 'ready' && 'animate-pulse')}
      />
    </button>
  )
}
