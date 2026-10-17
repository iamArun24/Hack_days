import { AiError, type KeyStatus } from './contract'

/** Parses Groq reset durations such as "7.66s", "2m59.56s", "1h2m3s" or "450ms" into ms. */
export function parseDuration(value: string | null | undefined): number | null {
  if (!value) return null
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g
  let total = 0
  let matched = false
  for (const [, num, unit] of value.matchAll(re)) {
    matched = true
    const n = Number(num)
    total += unit === 'h' ? n * 3_600_000 : unit === 'm' ? n * 60_000 : unit === 's' ? n * 1000 : n
  }
  if (!matched) {
    const n = Number(value)
    return Number.isFinite(n) ? n * 1000 : null
  }
  return total
}

export const maskKey = (key: string) => `${key.slice(0, 4)}…${key.slice(-4)}`

interface Slot {
  key: string
  inflight: number
  coolingUntil: number
  remainingTokens: number | null
  remainingRequests: number | null
  tokensResetAt: number | null
  calls: number
  failures: number
  invalid: boolean
}

export interface Lease {
  index: number
  key: string
}

const MAX_WAIT_MS = 30_000
const DEFAULT_COOLDOWN_MS = 10_000

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new AiError('aborted', 'Cancelled'))
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(new AiError('aborted', 'Cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })

/**
 * Rotates requests across several Groq keys. Each key tracks its own rate-limit headroom from
 * response headers; a 429 cools that key down so the next request goes to another one.
 */
export class KeyPool {
  private slots: Slot[] = []
  private cursor = 0
  private listeners = new Set<() => void>()
  private snapshot: KeyStatus[] = []
  now: () => number = () => Date.now()

  setKeys(keys: readonly string[]): void {
    const previous = new Map(this.slots.map((s) => [s.key, s]))
    this.slots = keys.map(
      (key) =>
        previous.get(key) ?? {
          key,
          inflight: 0,
          coolingUntil: 0,
          remainingTokens: null,
          remainingRequests: null,
          tokensResetAt: null,
          calls: 0,
          failures: 0,
          invalid: false,
        },
    )
    this.emit()
  }

  get size(): number {
    return this.slots.length
  }

  get usable(): number {
    return this.slots.filter((s) => !s.invalid).length
  }

  /** Effective token headroom: unknown counts as plenty, a passed reset restores it. */
  private headroom(s: Slot): number {
    if (s.remainingTokens === null) return Number.MAX_SAFE_INTEGER / 2
    if (s.tokensResetAt !== null && this.now() >= s.tokensResetAt) return Number.MAX_SAFE_INTEGER / 2
    return s.remainingTokens
  }

  private pick(estTokens: number, exclude: ReadonlySet<number>): number | null {
    const now = this.now()
    let best: number | null = null
    let bestScore = -Infinity
    const n = this.slots.length
    for (let k = 0; k < n; k++) {
      const i = (this.cursor + k) % n
      const s = this.slots[i]!
      if (s.invalid || exclude.has(i) || s.coolingUntil > now) continue
      const room = this.headroom(s)
      // Prefer keys that can fit the request, then fewest in flight, then most headroom.
      const score = (room >= estTokens ? 1e15 : 0) - s.inflight * 1e12 + Math.min(room, 1e11)
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    }
    return best
  }

  /** Waits (up to 30 s) for a usable key; throws if none are configured or all are invalid. */
  async acquire(
    estTokens: number,
    signal?: AbortSignal,
    exclude: ReadonlySet<number> = new Set(),
  ): Promise<Lease> {
    if (!this.slots.length) throw new AiError('no-keys', 'Add a Groq API key in AI settings.')
    const started = this.now()
    for (;;) {
      if (signal?.aborted) throw new AiError('aborted', 'Cancelled')
      if (!this.usable)
        throw new AiError('invalid-key', 'Every Groq key was rejected. Check them in AI settings.')
      const i = this.pick(estTokens, exclude)
      if (i !== null) {
        const s = this.slots[i]!
        s.inflight++
        s.calls++
        this.cursor = (i + 1) % this.slots.length
        this.emit()
        return { index: i, key: s.key }
      }
      const pending = this.slots.filter((s, idx) => !s.invalid && !exclude.has(idx))
      if (!pending.length) {
        // Every remaining key was excluded by the caller; let it fall back to them anyway.
        if (exclude.size) return this.acquire(estTokens, signal)
        throw new AiError('rate-limited', 'All keys are rate-limited.')
      }
      const earliest = Math.min(...pending.map((s) => s.coolingUntil))
      const wait = Math.max(50, earliest - this.now())
      if (this.now() - started + wait > MAX_WAIT_MS) {
        throw new AiError(
          'rate-limited',
          'All Groq keys are rate-limited. Add more keys or try again shortly.',
        )
      }
      await sleep(wait, signal)
    }
  }

  release(lease: Lease, outcome: { status: number; headers?: Headers | null }): void {
    const s = this.slots[lease.index]
    if (!s || s.key !== lease.key) return
    s.inflight = Math.max(0, s.inflight - 1)
    const h = outcome.headers
    if (h) {
      const tokens = h.get('x-ratelimit-remaining-tokens')
      const requests = h.get('x-ratelimit-remaining-requests')
      if (tokens !== null && tokens !== '') s.remainingTokens = Number(tokens)
      if (requests !== null && requests !== '') s.remainingRequests = Number(requests)
      const reset = parseDuration(h.get('x-ratelimit-reset-tokens'))
      if (reset !== null) s.tokensResetAt = this.now() + reset
    }
    if (outcome.status === 401 || outcome.status === 403) {
      s.invalid = true
      s.failures++
    } else if (outcome.status === 429) {
      s.failures++
      const retry = h?.get('retry-after')
      const ms =
        (retry ? parseDuration(retry) : null) ??
        parseDuration(h?.get('x-ratelimit-reset-tokens')) ??
        parseDuration(h?.get('x-ratelimit-reset-requests')) ??
        DEFAULT_COOLDOWN_MS
      s.coolingUntil = this.now() + Math.max(500, ms)
    } else if (outcome.status === 0 || outcome.status >= 500) {
      s.failures++
    }
    this.emit()
  }

  /** Clears the "invalid" flag, e.g. after the user re-tests keys. */
  markValid(index: number, valid: boolean): void {
    const s = this.slots[index]
    if (!s) return
    s.invalid = !valid
    this.emit()
  }

  statuses(): KeyStatus[] {
    return this.snapshot
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    const now = this.now()
    this.snapshot = this.slots.map((s, index) => ({
      index,
      label: maskKey(s.key),
      state: s.invalid ? 'invalid' : s.coolingUntil > now ? 'cooling' : s.inflight ? 'busy' : 'ready',
      coolingUntil: s.coolingUntil > now ? s.coolingUntil : null,
      remainingTokens: s.remainingTokens,
      remainingRequests: s.remainingRequests,
      inflight: s.inflight,
      calls: s.calls,
      failures: s.failures,
    }))
    for (const l of this.listeners) l()
    // Re-publish when the next cool-down ends so the UI flips the key back to "ready".
    const next = Math.min(...this.slots.map((s) => (s.coolingUntil > now ? s.coolingUntil : Infinity)))
    if (Number.isFinite(next) && this.listeners.size) {
      clearTimeout(this.timer)
      this.timer = setTimeout(() => this.emit(), next - now + 25)
    }
  }

  private timer: ReturnType<typeof setTimeout> | undefined
}
