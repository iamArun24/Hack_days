/*
 * AI layer contract — the single source of truth every AI feature builds against.
 * Implementations live next to this file (keys.ts, groq.ts, digest.ts, agents.ts, settings.ts)
 * and are re-exported from ./index.ts. UI code imports only from '@/ai'.
 *
 * Provider: Groq (OpenAI-compatible, CORS-enabled → called straight from the browser).
 *   POST https://api.groq.com/openai/v1/chat/completions
 *   GET  https://api.groq.com/openai/v1/models
 * Models (checked against console.groq.com/docs/models + /docs/deprecations, Oct 2026):
 *   openai/gpt-oss-120b  production · ~500 t/s · strict json_schema · reasoning_effort
 *   openai/gpt-oss-20b   production · ~1000 t/s · strict json_schema · reasoning_effort
 *   qwen/qwen3.8-27b     preview · ~450 t/s · strict json_schema · reasoning_effort + reasoning_format
 * The Llama models (llama-3.1-8b-instant, llama-3.3-70b-versatile) were shut down on 2026-08-16
 * and Llama 4 / qwen3-32b / qwen3.6-27b before that, so none of them appear here. At runtime the
 * chain is further narrowed to the models the user's key actually lists (see groq.ts).
 * Per-key limits are tight (≈30 RPM, ≈8K TPM), hence the key pool.
 */

import type { FilterCriteria } from '@/har/filter'

/* ─── Models ─── */

/** What a call needs; the client maps a role to a fallback chain of model ids. */
export type ModelRole = 'fast' | 'smart'

export const MODEL_CHAINS: Record<ModelRole, readonly string[]> = {
  fast: ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b'],
  smart: ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'],
}

/** Models that accept `response_format: { type: 'json_schema', strict: true }`. */
export const STRICT_SCHEMA_MODELS: ReadonlySet<string> = new Set([
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'meta-models/muse-spark-open',
])

/* ─── Key pool ─── */

export interface KeyStatus {
  /** Index in the pool (stable while keys are unchanged); UI shows "Key #n". */
  index: number
  /** Masked for display, e.g. "gsk_…a1B2". */
  label: string
  state: 'ready' | 'busy' | 'cooling' | 'invalid'
  /** Epoch ms when a cooling key becomes usable again. */
  coolingUntil: number | null
  remainingTokens: number | null
  remainingRequests: number | null
  inflight: number
  calls: number
  failures: number
}

/* ─── Client ─── */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CallOptions<T> {
  role: ModelRole
  messages: ChatMessage[]
  /** JSON schema of the expected answer (strict-mode compatible: all props required,
   * additionalProperties false, optional = nullable). Omit for plain text. */
  schema?: { name: string; schema: Record<string, unknown> }
  /** Validates/normalises parsed JSON; throw to trigger a retry on the next model. */
  parse?: (value: unknown) => T
  maxTokens?: number
  reasoningEffort?: 'low' | 'medium' | 'high'
  temperature?: number
  signal?: AbortSignal
}

export interface CallResult<T> {
  data: T
  model: string
  keyIndex: number
  ms: number
  usage: { prompt: number; completion: number; total: number }
}

export class AiError extends Error {
  override name = 'AiError'
  readonly code: 'no-keys' | 'invalid-key' | 'rate-limited' | 'network' | 'bad-output' | 'aborted' | 'consent'
  constructor(code: AiError['code'], message: string) {
    super(message)
    this.code = code
  }
}

/* ─── Agents ─── */

/** A finding always points at concrete requests so the UI can link to the inspector. */
export interface Finding {
  title: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  /** What is happening and why it matters (2–4 sentences, plain language). */
  detail: string
  /** Concrete fix steps. */
  fix: string[]
  /** Entry ids (Entry.id) the finding refers to. */
  entryIds: number[]
  /** Estimated impact, e.g. "≈1.2 s faster LCP" or "removes 4 failing calls". Nullable. */
  impact: string | null
}

export type SpecialistId = 'performance' | 'reliability' | 'security' | 'api'

export interface SpecialistReport {
  agent: SpecialistId
  summary: string
  findings: Finding[]
}

export interface ActionItem {
  title: string
  owner: 'frontend' | 'backend' | 'devops' | 'security'
  effort: 'S' | 'M' | 'L'
  impact: 'low' | 'medium' | 'high'
  entryIds: number[]
}

export interface DiagnosisReport {
  /** One-paragraph executive summary. */
  headline: string
  /** 0–100 overall verdict from the lead agent. */
  score: number
  rootCauses: Finding[]
  actionPlan: ActionItem[]
  /** Questions a human should verify (things the HAR cannot prove). */
  openQuestions: string[]
  specialists: SpecialistReport[]
}

export type AgentStage = 'queued' | 'running' | 'done' | 'failed'

/** Progress events streamed to the UI while a diagnosis runs. */
export type DiagnosisEvent =
  | {
      type: 'agent'
      agent: SpecialistId | 'lead'
      stage: AgentStage
      model?: string
      keyIndex?: number
      ms?: number
      tokens?: number
      error?: string
    }
  | { type: 'done'; report: DiagnosisReport }

export interface RequestExplanation {
  /** One-line verdict, e.g. "401 — the bearer token expired". */
  verdict: string
  status: 'ok' | 'warning' | 'error'
  /** What happened, step by step, in plain language. */
  whatHappened: string[]
  likelyCauses: string[]
  fixes: string[]
  /** Optional corrected request as a cURL command (secrets kept redacted); null if not applicable. */
  correctedCurl: string | null
}

/** Natural-language filter result: a partial criteria object plus a human-readable echo. */
export interface NlFilterResult {
  criteria: Partial<
    Pick<
      FilterCriteria,
      | 'query'
      | 'useRegex'
      | 'negate'
      | 'scope'
      | 'methods'
      | 'statuses'
      | 'types'
      | 'domains'
      | 'minTime'
      | 'maxTime'
      | 'minSize'
      | 'maxSize'
    >
  >
  /** e.g. "POST requests to api.example.com that failed (4xx/5xx) and took > 500 ms". */
  explanation: string
}

export interface CompareExplanation {
  headline: string
  regressions: Array<{ title: string; detail: string }>
  improvements: Array<{ title: string; detail: string }>
  likelyCause: string
}

/* ─── Settings (persisted in localStorage under 'har-viewer:ai', never bundled) ─── */

export interface AiSettings {
  /** Groq API keys, one per pool slot. */
  keys: string[]
  /** User accepted that redacted capture data is sent to Groq. */
  consent: boolean
  /** Override model per role; null = automatic chain. */
  models: Record<ModelRole, string | null>
  /** Run the full agent pipeline automatically whenever a new capture is opened. */
  autopilot: boolean
}

/*
 * Public API (implemented in ./index.ts):
 *
 *   useAiSettings                          zustand store: AiSettings + setKeys(keys) / setConsent(bool) / setModel(role, id|null)
 *   useKeyStatuses(): KeyStatus[]          live pool status for the UI
 *   aiReady(): boolean                     ≥1 key and consent given
 *   testKeys(): Promise<Array<{ index: number; ok: boolean; message: string }>>
 *   listModels(): Promise<string[]>        GET /models with the first healthy key
 *   callAi<T>(opts: CallOptions<T>): Promise<CallResult<T>>
 *
 *   captureDigest(entries): string         compact, redacted capture summary (≤ ~3K tokens)
 *   requestDigest(entry): string           one request, redacted, bodies truncated
 *   previewPayload(kind, entries, entry?)  exact text that would be sent, for the "what is sent" preview
 *
 *   runDiagnosis(entries, onEvent, signal?): Promise<DiagnosisReport>   4 specialists in parallel → lead
 *   explainRequest(entry, entries, signal?): Promise<RequestExplanation>
 *   nlToFilter(text, facets, signal?): Promise<NlFilterResult>
 *   generateOpenApi(endpoints, entries, signal?): Promise<string>       OpenAPI 3.1 YAML
 *   explainComparison(base, other, signal?): Promise<CompareExplanation>
 */
