import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeFacets } from '@/har/facets'
import { entry } from '@/har/test-utils'
import type { DiagnosisEvent } from './contract'
import { captureDigest, requestDigest } from './digest'
import { callAi, useAiSettings, nlToFilter, runDiagnosis, validateFilter } from './index'
import { KeyPool, parseDuration } from './keys'

type Handler = (
  body: Record<string, unknown>,
  key: string,
) => { status: number; json?: unknown; headers?: Record<string, string> }

let calls: Array<{ key: string; body: Record<string, unknown> }> = []

function mockGroq(handler: Handler) {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const key = String((init.headers as Record<string, string>).Authorization).replace('Bearer ', '')
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      calls.push({ key, body })
      const r = handler(body, key)
      return new Response(JSON.stringify(r.json ?? { error: { message: 'boom' } }), {
        status: r.status,
        headers: { 'content-type': 'application/json', ...r.headers },
      })
    }),
  )
}

const reply = (content: unknown) => ({
  status: 200,
  json: {
    choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  },
  headers: { 'x-ratelimit-remaining-tokens': '7000', 'x-ratelimit-reset-tokens': '7.5s' },
})

let seq = 0
function useKeys(n = 2) {
  seq++
  const keys = Array.from({ length: n }, (_, i) => `gsk_test${seq}x${i}abcdefghijkl${i}${seq}`)
  useAiSettings.getState().setKeys(keys)
  useAiSettings.getState().setConsent(true)
  return keys
}

beforeEach(() => vi.unstubAllGlobals())
afterEach(() => vi.unstubAllGlobals())

describe('rate-limit headers', () => {
  it('parses Groq reset durations', () => {
    expect(parseDuration('7.66s')).toBeCloseTo(7660)
    expect(parseDuration('2m59.56s')).toBeCloseTo(179_560)
    expect(parseDuration('450ms')).toBe(450)
    expect(parseDuration('1h')).toBe(3_600_000)
    expect(parseDuration('3')).toBe(3000)
    expect(parseDuration(null)).toBeNull()
  })
})

describe('KeyPool', () => {
  it('spreads concurrent calls across keys and cools a key after 429', async () => {
    const pool = new KeyPool()
    pool.setKeys(['gsk_a_000000001111', 'gsk_b_000000002222'])
    const a = await pool.acquire(100)
    const b = await pool.acquire(100)
    expect(new Set([a.index, b.index]).size).toBe(2)

    pool.release(a, { status: 429, headers: new Headers({ 'retry-after': '30' }) })
    pool.release(b, { status: 200, headers: new Headers({ 'x-ratelimit-remaining-tokens': '5000' }) })
    expect(pool.statuses()[a.index]!.state).toBe('cooling')
    const next = await pool.acquire(100)
    expect(next.index).toBe(b.index)
    expect(pool.statuses()[0]!.label).toMatch(/^gsk_…\d{4}$/)
  })

  it('waits for the earliest cool-down when every key is cooling', async () => {
    const pool = new KeyPool()
    pool.setKeys(['gsk_only_0000009999'])
    const lease = await pool.acquire(10)
    pool.release(lease, { status: 429, headers: new Headers({ 'retry-after': '0.06' }) })
    const started = Date.now()
    await pool.acquire(10)
    expect(Date.now() - started).toBeGreaterThanOrEqual(40)
  })

  it('marks rejected keys invalid and fails once none are left', async () => {
    const pool = new KeyPool()
    pool.setKeys(['gsk_bad_0000001234'])
    pool.release(await pool.acquire(10), { status: 401 })
    await expect(pool.acquire(10)).rejects.toMatchObject({ code: 'invalid-key' })
  })
})

describe('callAi', () => {
  it('rotates to another key on 429 and returns parsed JSON', async () => {
    const keys = useKeys(2)
    let first = true
    mockGroq(() => {
      if (first) {
        first = false
        return { status: 429, headers: { 'retry-after': '20' } }
      }
      return reply({ ok: true })
    })
    const r = await callAi<{ ok: boolean }>({
      role: 'fast',
      messages: [{ role: 'user', content: 'hi' }],
      schema: { name: 't', schema: { type: 'object' } },
    })
    expect(r.data).toEqual({ ok: true })
    expect(calls).toHaveLength(2)
    expect(calls[0]!.key).not.toBe(calls[1]!.key)
    expect(keys).toContain(calls[1]!.key)
    expect(calls[1]!.body.response_format).toMatchObject({ type: 'json_schema' })
    expect(calls[1]!.body.include_reasoning).toBe(false)
  })

  it('falls back to the next model when output is unusable', async () => {
    useKeys(1)
    mockGroq((body) =>
      body.model === 'openai/gpt-oss-20b' ? reply('not json at all') : reply('```json\n{"v":1}\n```'),
    )
    const r = await callAi<{ v: number }>({
      role: 'fast',
      messages: [{ role: 'user', content: 'x' }],
      schema: { name: 't', schema: { type: 'object' } },
    })
    expect(r.model).toBe('qwen/qwen3.8-27b')
    expect(r.data).toEqual({ v: 1 })
    expect(calls[1]!.body.response_format).toMatchObject({ type: 'json_schema' })
    expect(calls[1]!.body.reasoning_format).toBe('hidden')
    expect(calls[1]!.body.include_reasoning).toBeUndefined()
  })

  it('refuses without consent', async () => {
    useKeys(1)
    useAiSettings.getState().setConsent(false)
    await expect(callAi({ role: 'fast', messages: [] })).rejects.toMatchObject({ code: 'consent' })
  })
})

describe('digest redaction', () => {
  const leaky = entry(3, {
    url: 'https://api.shop.com/v1/orders?access_token=supersecretvalue123&page=2',
    method: 'POST',
    status: 401,
    requestHeaders: [
      { name: 'Authorization', value: 'Bearer abcdefghijklmnopqrstuvwxyz0123456789' },
      { name: 'Cookie', value: 'sid=topsecretcookie' },
    ],
    requestBody:
      '{"email":"jane.doe@example.com","note":"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"}',
    responseHeaders: [{ name: 'set-cookie', value: 'sid=newsecretcookie; HttpOnly' }],
  })

  it('never leaks tokens, cookies or emails', () => {
    for (const text of [requestDigest(leaky), captureDigest([leaky, entry(4)])]) {
      expect(text).not.toMatch(
        /supersecretvalue123|topsecretcookie|newsecretcookie|jane\.doe|abcdefghijklmnopqrstuvwxyz0123|eyJhbGci/,
      )
    }
    expect(captureDigest([leaky, entry(4)])).toContain('#3 POST 401')
    expect(requestDigest(leaky)).toContain('REQUEST #3')
  })
})

describe('nl filter', () => {
  const entries = [
    entry(1, { url: 'https://api.x.com/a', method: 'POST', status: 500 }),
    entry(2, { url: 'https://cdn.x.com/b.js', mime: 'application/javascript' }),
  ]
  const facets = computeFacets(entries)

  it('keeps only known facet values and sane numbers', () => {
    const r = validateFilter(
      {
        criteria: {
          methods: ['post', 'BREW'],
          statuses: ['5xx', 'teapot'],
          domains: ['api.x.com', 'evil.com'],
          minTime: 500,
          maxSize: -3,
          query: '(',
          useRegex: true,
        },
        explanation: 'Failed POSTs to the API',
      },
      facets,
    )
    expect(r.criteria).toEqual({
      methods: ['POST'],
      statuses: ['5xx'],
      domains: ['api.x.com'],
      minTime: 500,
      query: '(',
      useRegex: false,
    })
  })

  it('round-trips through the model', async () => {
    useKeys(1)
    mockGroq(() =>
      reply({ criteria: { methods: ['POST'], statuses: null, query: null }, explanation: 'POST requests' }),
    )
    const r = await nlToFilter('show posts', facets)
    expect(r).toEqual({ criteria: { methods: ['POST'] }, explanation: 'POST requests' })
  })
})

describe('runDiagnosis', () => {
  it('runs specialists in parallel, survives one failure and filters ids', async () => {
    useKeys(3)
    const entries = [entry(1, { status: 503, time: 3000 }), entry(2, { start: 100 })]
    const finding = {
      title: 'Slow API',
      severity: 'high',
      detail: 'd',
      fix: ['f'],
      entryIds: [1, 999],
      impact: null,
    }
    mockGroq((body) => {
      const sys = JSON.stringify(body.messages)
      if (sys.includes('site reliability engineer')) return { status: 500 }
      if (sys.includes('lead engineer'))
        return reply({
          headline: 'H',
          score: 140,
          rootCauses: [finding],
          actionPlan: [{ title: 'Fix it', owner: 'backend', effort: 'S', impact: 'high', entryIds: [2, 77] }],
          openQuestions: ['Q?'],
        })
      return reply({ summary: 'S', findings: [finding] })
    })
    const events: DiagnosisEvent[] = []
    const report = await runDiagnosis(entries, (e) => events.push(e))

    expect(report.specialists.map((s) => s.agent).sort()).toEqual(['api', 'performance', 'security'])
    expect(report.score).toBe(100)
    expect(report.rootCauses[0]!.entryIds).toEqual([1])
    expect(report.actionPlan[0]!.entryIds).toEqual([2])
    expect(events).toContainEqual(expect.objectContaining({ agent: 'reliability', stage: 'failed' }))
    expect(events).toContainEqual(expect.objectContaining({ agent: 'lead', stage: 'done' }))
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })
})
