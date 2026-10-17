import {
  Bot,
  CircleCheck,
  CircleX,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Trash,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  aiReady,
  listModels,
  testKeys,
  useAiSettings,
  useKeyStatuses,
  type KeyStatus,
  type ModelRole,
} from '@/ai'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/cn'
import { formatNumber } from '@/lib/format'
import { useAppStore } from '@/store'
import { Switch } from './ai-quick-setup'
import { OPEN_AI_SETTINGS_EVENT, parseKeys } from './events'
import { useAutopilot } from './use-ai-status'

const mask = (key: string) => (key.length > 12 ? `${key.slice(0, 4)}…${key.slice(-4)}` : '••••')

const ROLES: ReadonlyArray<{ role: ModelRole; label: string; hint: string }> = [
  {
    role: 'fast',
    label: 'Fast agents',
    hint: 'Specialists, filters and explanations. Default openai/gpt-oss-20b at about 1000 tokens/s.',
  },
  {
    role: 'smart',
    label: 'Lead agent',
    hint: 'Merges findings into the final diagnosis. Default openai/gpt-oss-120b.',
  },
]

const STATE_TONE: Record<KeyStatus['state'], string> = {
  ready: 'bg-success',
  busy: 'bg-info animate-pulse',
  cooling: 'bg-warning',
  invalid: 'bg-danger',
}

/** Re-renders every second while something is counting down. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

function KeyRow({
  keyText,
  index,
  status,
  test,
  now,
}: {
  keyText: string
  index: number
  status: KeyStatus | undefined
  test: { ok: boolean; message: string } | undefined
  now: number
}) {
  const state = status?.state ?? 'ready'
  const cooling = state === 'cooling' && status?.coolingUntil ? Math.max(0, status.coolingUntil - now) : 0
  return (
    <div className="flex items-center gap-3 px-3 py-2 text-xs">
      <span className={cn('size-2 shrink-0 rounded-full', STATE_TONE[state])} aria-hidden />
      <span className="w-12 shrink-0 text-muted-foreground">Key #{index + 1}</span>
      <span className="min-w-0 flex-1 truncate font-mono">{status?.label ?? mask(keyText)}</span>
      <span className="shrink-0 text-muted-foreground tabular">
        {state === 'cooling'
          ? `cooling ${Math.ceil(cooling / 1000)} s`
          : state === 'invalid'
            ? 'invalid'
            : state === 'busy'
              ? `busy · ${status?.inflight ?? 0}`
              : 'ready'}
      </span>
      {status && (
        <span className="hidden shrink-0 text-subtle-foreground tabular sm:inline">
          {formatNumber(status.calls)} calls
          {status.remainingTokens !== null && ` · ${formatNumber(status.remainingTokens)} tok left`}
        </span>
      )}
      {test && (
        <span title={test.message} className="shrink-0">
          {test.ok ? (
            <CircleCheck className="size-4 text-success" aria-label="Key works" />
          ) : (
            <CircleX className="size-4 text-danger" aria-label={`Key failed: ${test.message}`} />
          )}
        </span>
      )}
    </div>
  )
}

function SettingsBody() {
  const keys = useAiSettings((s) => s.keys)
  const consent = useAiSettings((s) => s.consent)
  const models = useAiSettings((s) => s.models)
  const setKeys = useAiSettings((s) => s.setKeys)
  const setConsent = useAiSettings((s) => s.setConsent)
  const setModel = useAiSettings((s) => s.setModel)
  const statuses = useKeyStatuses()
  const [autopilot, setAutopilot] = useAutopilot()

  const [draft, setDraft] = useState('')
  const [tests, setTests] = useState<Record<number, { ok: boolean; message: string }>>({})
  const [testing, setTesting] = useState(false)
  const [available, setAvailable] = useState<string[] | null>(null)
  const [loadingModels, setLoadingModels] = useState(false)
  const now = useNow(statuses.some((s) => s.state === 'cooling'))

  const addKeys = () => {
    const added = parseKeys(draft)
    if (!added.length) return
    const next = [...new Set([...keys, ...added])]
    setKeys(next)
    setDraft('')
    setTests({})
    toast.success(`${added.length} key${added.length > 1 ? 's' : ''} saved`, {
      description: `${next.length} in the pool.`,
    })
  }

  const removeKey = (index: number) => {
    setKeys(keys.filter((_, i) => i !== index))
    setTests({})
  }

  const runTests = async () => {
    setTesting(true)
    try {
      const results = await testKeys()
      setTests(Object.fromEntries(results.map((r) => [r.index, { ok: r.ok, message: r.message }])))
      const ok = results.filter((r) => r.ok).length
      if (ok === results.length) toast.success(`All ${ok} keys work`)
      else toast.warning(`${ok} of ${results.length} keys work`)
    } catch (error) {
      toast.error('Could not test keys', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setTesting(false)
    }
  }

  const loadModels = async () => {
    if (available || loadingModels) return
    setLoadingModels(true)
    try {
      setAvailable(await listModels())
    } catch (error) {
      toast.error('Could not load models', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setLoadingModels(false)
    }
  }

  return (
    <DialogBody className="flex flex-col gap-6">
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
            <KeyRound className="size-4 text-primary" /> Groq API keys
          </h3>
          <a
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Get a free key <ExternalLink className="size-3" />
          </a>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Add one key or several. With several keys the specialist agents run{' '}
          <span className="text-foreground">in parallel</span>, and when one key hits Groq&apos;s rate limit
          the next one takes over automatically.
        </p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addKeys()
          }}
          placeholder={'gsk_…\ngsk_…   (one per line, or comma separated)'}
          spellCheck={false}
          autoComplete="off"
          rows={3}
          className="w-full resize-y rounded-lg border border-input bg-panel px-3 py-2 font-mono text-xs outline-none placeholder:text-subtle-foreground focus:border-ring focus:ring-3 focus:ring-ring/20"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={addKeys} disabled={!parseKeys(draft).length}>
            Save keys
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runTests()}
            disabled={!keys.length || testing}
          >
            {testing ? <LoaderCircle className="animate-spin" /> : <CircleCheck />} Test keys
          </Button>
          {keys.length > 0 && (
            <Button
              variant="danger"
              size="sm"
              className="ml-auto"
              onClick={() => {
                setKeys([])
                setTests({})
                toast('All keys removed from this browser')
              }}
            >
              <Trash /> Remove all keys
            </Button>
          )}
        </div>
        {keys.length > 0 ? (
          <ul className="divide-y overflow-hidden rounded-xl border bg-panel/60">
            {keys.map((key, i) => (
              <li key={key} className="group flex items-center">
                <div className="min-w-0 flex-1">
                  <KeyRow
                    keyText={key}
                    index={i}
                    status={statuses.find((s) => s.index === i)}
                    test={tests[i]}
                    now={now}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="mr-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => removeKey(i)}
                  aria-label={`Remove key ${i + 1}`}
                >
                  <Trash />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
            No keys yet. AI features stay off until you add one.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2.5">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Sparkles className="size-4 text-primary" /> Models
        </h3>
        {ROLES.map(({ role, label, hint }) => (
          <label key={role} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span className="flex-1">
              <span className="block text-xs font-medium">{label}</span>
              <span className="block text-2xs text-muted-foreground">{hint}</span>
            </span>
            <select
              value={models[role] ?? ''}
              onFocus={() => void loadModels()}
              onPointerDown={() => void loadModels()}
              onChange={(e) => setModel(role, e.target.value || null)}
              className="h-8 w-full rounded-lg border border-input bg-panel px-2 text-xs outline-none focus:border-ring focus:ring-3 focus:ring-ring/20 sm:w-60"
            >
              <option value="">Automatic (recommended)</option>
              {models[role] && !available?.includes(models[role]) && (
                <option value={models[role]}>{models[role]}</option>
              )}
              {loadingModels && <option disabled>Loading models…</option>}
              {available?.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        ))}
      </section>

      <section className="flex flex-col gap-2.5 rounded-xl border bg-lavender/10 p-3.5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Bot className="size-4 text-primary" /> Autopilot
          </h3>
          <Switch
            checked={autopilot}
            onChange={setAutopilot}
            label="Analyse every new upload automatically"
          />
        </div>
        <p className="text-xs font-medium">Analyse every new upload automatically</p>
        <ol className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
          {[
            '4 specialist agents',
            'Lead agent',
            'Explain key requests',
            'Suggested views',
            'OpenAPI draft',
          ].map((step, i, all) => (
            <li key={step} className="flex items-center gap-1">
              <span className="rounded-full border bg-background/60 px-2 py-0.5">{step}</span>
              {i < all.length - 1 && <span className="text-subtle-foreground">→</span>}
            </li>
          ))}
        </ol>
        <p className="text-2xs leading-relaxed text-muted-foreground">
          Each upload uses about 6–10 Groq calls. With more keys the agents run in parallel and finish faster.
          Turn this off to run AI actions only when you ask.
        </p>
      </section>

      <section className="flex flex-col gap-2.5 rounded-xl border bg-sage/10 p-3.5">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <ShieldCheck className="size-4 text-success" /> Privacy
        </h3>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed text-muted-foreground">
          <li>
            Only a <span className="text-foreground">redacted digest</span> is sent to Groq. Authorization
            headers, cookies, tokens, keys and email addresses are masked, and bodies are truncated.
          </li>
          <li>
            {autopilot
              ? 'With Autopilot on, each new upload is analysed automatically. Otherwise nothing is sent until you run an AI action.'
              : 'Nothing is sent until you run an AI action yourself.'}
          </li>
          <li>
            Your keys are stored only in this browser&apos;s localStorage. They are never bundled into a
            deployment.
          </li>
        </ul>
        <label className="mt-1 flex cursor-default items-start gap-2.5 text-xs">
          <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
          <span>I understand that redacted capture data is sent to Groq when I use AI features.</span>
        </label>
      </section>
    </DialogBody>
  )
}

export function AiSettingsDialog() {
  const open = useAppStore((s) => s.dialog.type === 'ai-settings')
  const openDialog = useAppStore((s) => s.openDialog)
  const closeDialog = useAppStore((s) => s.closeDialog)
  const keys = useAiSettings((s) => s.keys)
  const consent = useAiSettings((s) => s.consent)

  useEffect(() => {
    const onOpen = () => openDialog({ type: 'ai-settings' })
    addEventListener(OPEN_AI_SETTINGS_EVENT, onOpen)
    return () => removeEventListener(OPEN_AI_SETTINGS_EVENT, onOpen)
  }, [openDialog])

  const status = aiReady()
    ? 'AI is ready.'
    : !keys.length
      ? 'Add a Groq key to turn AI on.'
      : !consent
        ? 'Accept the privacy note below to turn AI on.'
        : 'Not ready yet.'

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? openDialog({ type: 'ai-settings' }) : closeDialog())}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> AI agents
          </DialogTitle>
          <DialogDescription>
            Diagnose captures, explain failing requests, filter in plain English and draft API specs, powered
            by Groq. {status}
          </DialogDescription>
        </DialogHeader>
        <SettingsBody />
        <DialogFooter>
          <span className="mr-auto text-xs text-muted-foreground">
            {keys.length} key{keys.length === 1 ? '' : 's'} · {consent ? 'consent given' : 'consent needed'}
          </span>
          <Button variant="primary" size="sm" onClick={closeDialog}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
