import { useSyncExternalStore } from 'react'
import {
  AiError,
  MODEL_CHAINS,
  STRICT_SCHEMA_MODELS,
  type CallOptions,
  type CallResult,
  type ChatMessage,
  type KeyStatus,
  type ModelRole,
} from './contract'
import { KeyPool, type Lease } from './keys'
import { useAiSettings } from './settings'

const API = 'https://api.groq.com/openai/v1'

export const pool = new KeyPool()
pool.setKeys(useAiSettings.getState().keys)
useAiSettings.subscribe((s, prev) => {
  if (s.keys !== prev.keys) pool.setKeys(s.keys)
})

export const useKeyStatuses = (): KeyStatus[] => useSyncExternalStore(pool.subscribe, () => pool.statuses())

export const aiReady = (): boolean => {
  const s = useAiSettings.getState()
  return s.consent && s.keys.length > 0 && pool.usable > 0
}

export const estimateTokens = (messages: readonly ChatMessage[]) =>
  Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 4)

/** Ids the user's key lists (from Test keys / the model picker); null until known. */
let available: ReadonlySet<string> | null = null
/** Models Groq reported as removed or unknown during this session. */
const unavailable = new Set<string>()

export function modelChain(role: ModelRole): string[] {
  const override = useAiSettings.getState().models[role]
  const base = MODEL_CHAINS[role]
  const chain = (override ? [override, ...base.filter((m) => m !== override)] : [...base]).filter(
    (m) => !unavailable.has(m),
  )
  const listed = available ? chain.filter((m) => available!.has(m)) : chain
  return listed.length ? listed : chain.length ? chain : [...base]
}

const isGptOss = (model: string) => model.startsWith('openai/gpt-oss')
const isQwen = (model: string) => model.startsWith('qwen/')

function stripFences(text: string): string {
  const fenced = /^\s*```[\w-]*\s*\n([\s\S]*?)\n?```\s*$/.exec(text)
  return fenced ? fenced[1]! : text
}

/** Pulls the first JSON object out of a reply that may carry prose or fences around it. */
export function extractJson(text: string): unknown {
  const body = stripFences(text).trim()
  try {
    return JSON.parse(body)
  } catch {
    const start = body.indexOf('{')
    const end = body.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1))
    throw new Error('Reply was not JSON')
  }
}

function buildBody<T>(model: string, opts: CallOptions<T>): Record<string, unknown> {
  const strict = !!opts.schema && STRICT_SCHEMA_MODELS.has(model)
  let messages = opts.messages
  if (opts.schema && !strict) {
    const note = `\n\nRespond with ONLY a JSON object (no prose, no code fences) that matches this JSON Schema:\n${JSON.stringify(opts.schema.schema)}`
    const [first, ...rest] = messages
    messages =
      first?.role === 'system'
        ? [{ ...first, content: first.content + note }, ...rest]
        : [{ role: 'system', content: note.trim() }, ...messages]
  }
  const body: Record<string, unknown> = {
    model,
    messages,
    max_completion_tokens: opts.maxTokens ?? (opts.role === 'smart' ? 6144 : 4096),
    temperature: opts.temperature ?? 0.2,
  }
  if (isQwen(model)) {
    // Qwen's documented thinking-mode sampling; reasoning stays server-side.
    body.temperature = opts.temperature ?? 1
    body.top_p = 0.95
    body.reasoning_effort = opts.reasoningEffort ?? (opts.role === 'smart' ? 'medium' : 'low')
    body.reasoning_format = 'hidden'
    body.max_completion_tokens = Math.min(body.max_completion_tokens as number, 16_384)
  }
  if (opts.schema) {
    body.response_format = strict
      ? {
          type: 'json_schema',
          json_schema: { name: opts.schema.name, strict: true, schema: opts.schema.schema },
        }
      : { type: 'json_object' }
  }
  if (isGptOss(model)) {
    body.reasoning_effort = opts.reasoningEffort ?? (opts.role === 'smart' ? 'medium' : 'low')
    body.include_reasoning = false
  }
  return body
}

interface GroqError {
  error?: { message?: string; code?: string; type?: string }
}

/** The model itself can't serve this request — try the next model in the chain. */
const modelProblem = (status: number, text: string) =>
  status === 404 ||
  (status === 400 &&
    /model_not_found|decommissioned|does not exist|not supported|json_validate_failed|output_parse_failed|response_format/i.test(
      text,
    )) ||
  status === 413 ||
  status === 422

type Attempt<T> =
  { ok: true; result: CallResult<T> } | { ok: false; next: 'model' | 'key' | 'retry'; error: AiError }

async function attempt<T>(model: string, lease: Lease, opts: CallOptions<T>): Promise<Attempt<T>> {
  const started = performance.now()
  let res: Response
  try {
    res = await fetch(`${API}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${lease.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBody(model, opts)),
      signal: opts.signal,
    })
  } catch (error) {
    pool.release(lease, { status: 0 })
    if (opts.signal?.aborted || (error as Error)?.name === 'AbortError')
      throw new AiError('aborted', 'Cancelled')
    return {
      ok: false,
      next: 'retry',
      error: new AiError('network', 'Could not reach Groq. Check your connection.'),
    }
  }
  pool.release(lease, { status: res.status, headers: res.headers })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let message = text
    try {
      message = (JSON.parse(text) as GroqError).error?.message ?? text
    } catch {
      /* keep raw text */
    }
    if (res.status === 401 || res.status === 403)
      return {
        ok: false,
        next: 'key',
        error: new AiError('invalid-key', `Key ${lease.index + 1} was rejected.`),
      }
    if (res.status === 429)
      return { ok: false, next: 'key', error: new AiError('rate-limited', 'Rate limited — rotating keys.') }
    if (modelProblem(res.status, text))
      return {
        ok: false,
        next: 'model',
        error: new AiError('bad-output', `${model}: ${message.slice(0, 200)}`),
      }
    if (res.status >= 500)
      return { ok: false, next: 'retry', error: new AiError('network', `Groq error ${res.status}`) }
    return {
      ok: false,
      next: 'model',
      error: new AiError('bad-output', `${model}: ${message.slice(0, 200)}`),
    }
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    model?: string
  }
  const content = json.choices?.[0]?.message?.content ?? ''
  let data: T
  try {
    const raw: unknown = opts.schema ? extractJson(content) : stripFences(content).trim()
    data = opts.parse ? opts.parse(raw) : (raw as T)
  } catch (error) {
    return {
      ok: false,
      next: 'model',
      error: new AiError('bad-output', `${model} returned an unusable answer: ${(error as Error).message}`),
    }
  }
  const usage = json.usage ?? {}
  return {
    ok: true,
    result: {
      data,
      model,
      keyIndex: lease.index,
      ms: Math.round(performance.now() - started),
      usage: {
        prompt: usage.prompt_tokens ?? 0,
        completion: usage.completion_tokens ?? 0,
        total: usage.total_tokens ?? 0,
      },
    },
  }
}

/**
 * One structured call with key rotation and model fallback:
 * 429 → another key · 401/403 → key marked invalid, another key · 5xx/network → one retry,
 * then next model · model errors or unusable output → next model in the role's chain.
 */
export async function callAi<T>(opts: CallOptions<T>): Promise<CallResult<T>> {
  const settings = useAiSettings.getState()
  if (!settings.keys.length) throw new AiError('no-keys', 'Add a Groq API key in AI settings.')
  if (!settings.consent) throw new AiError('consent', 'Allow sending redacted capture data to Groq first.')

  const est = estimateTokens(opts.messages) + (opts.maxTokens ?? 1024)
  let lastError: AiError = new AiError('network', 'No model answered.')
  for (const model of modelChain(opts.role)) {
    let retries = 0
    let keyHops = 0
    const tried = new Set<number>()
    for (;;) {
      const lease = await pool.acquire(est, opts.signal, tried)
      const outcome = await attempt(model, lease, opts)
      if (outcome.ok) return outcome.result
      lastError = outcome.error
      if (outcome.next === 'model') {
        if (/decommissioned|model_not_found|does not exist|HTTP 404/i.test(lastError.message))
          unavailable.add(model)
        break
      }
      if (outcome.next === 'retry') {
        if (++retries > 1) break
        continue
      }
      // 'key': try another key; once every key had a go, acquire() waits for cool-downs.
      tried.add(lease.index)
      if (tried.size >= pool.size) tried.clear()
      if (++keyHops > pool.size * 3) break
      if (lastError.code === 'invalid-key' && !pool.usable) throw lastError
    }
  }
  throw lastError
}

export async function testKeys(): Promise<Array<{ index: number; ok: boolean; message: string }>> {
  const keys = useAiSettings.getState().keys
  if (!keys.length) throw new AiError('no-keys', 'Add a Groq API key first.')
  return Promise.all(
    keys.map(async (key, index) => {
      try {
        const res = await fetch(`${API}/models`, { headers: { Authorization: `Bearer ${key}` } })
        pool.markValid(index, res.status !== 401 && res.status !== 403)
        if (res.ok) {
          const json = (await res.json()) as { data?: Array<{ id: string; active?: boolean }> }
          rememberModels(json.data ?? [])
          return { index, ok: true, message: `OK · ${json.data?.length ?? 0} models available` }
        }
        if (res.status === 401 || res.status === 403) return { index, ok: false, message: 'Invalid key' }
        if (res.status === 429) return { index, ok: true, message: 'Valid, currently rate-limited' }
        return { index, ok: false, message: `HTTP ${res.status}` }
      } catch {
        return { index, ok: false, message: 'Network error' }
      }
    }),
  )
}

function rememberModels(models: ReadonlyArray<{ id: string; active?: boolean }>) {
  const ids = models.filter((m) => m.active !== false).map((m) => m.id)
  if (ids.length) available = new Set(ids)
}

export async function listModels(): Promise<string[]> {
  const keys = useAiSettings.getState().keys
  if (!keys.length) throw new AiError('no-keys', 'Add a Groq API key first.')
  let last: AiError = new AiError('network', 'Could not list models.')
  for (const key of keys) {
    try {
      const res = await fetch(`${API}/models`, { headers: { Authorization: `Bearer ${key}` } })
      if (!res.ok) {
        last = new AiError(res.status === 401 ? 'invalid-key' : 'network', `HTTP ${res.status}`)
        continue
      }
      const json = (await res.json()) as { data?: Array<{ id: string; active?: boolean }> }
      rememberModels(json.data ?? [])
      return (json.data ?? [])
        .filter((m) => m.active !== false)
        .map((m) => m.id)
        .sort()
    } catch {
      last = new AiError('network', 'Network error')
    }
  }
  throw last
}
