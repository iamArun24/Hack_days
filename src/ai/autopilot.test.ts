import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { entry } from '@/har/test-utils'
import type { AutopilotEvent, AutopilotStage } from './autopilot'
import { explainCache, pickExplainTargets, runAutopilot, useAiSettings } from './index'

const finding = (ids: number[]) => ({
  title: 'Slow API',
  severity: 'high',
  detail: 'The API is slow.',
  fix: ['Cache it'],
  entryIds: ids,
  impact: null,
})

const ANSWERS: Record<string, unknown> = {
  diagnosis: {
    headline: 'Slow API',
    score: 60,
    rootCauses: [finding([1])],
    actionPlan: [],
    openQuestions: [],
  },
  request_explanation: {
    verdict: '503 — upstream down',
    status: 'error',
    whatHappened: ['Called the API'],
    likelyCauses: ['Upstream'],
    fixes: ['Retry'],
    correctedCurl: null,
  },
  suggested_views: {
    views: [
      {
        label: 'Failures',
        reason: '1 request failed',
        criteria: {
          query: null,
          useRegex: null,
          negate: null,
          scope: null,
          methods: null,
          statuses: ['5xx', 'nonsense'],
          types: null,
          domains: null,
          minTime: null,
          maxTime: null,
          minSize: null,
          maxSize: null,
        },
      },
    ],
  },
  openapi: { yaml: 'openapi: 3.1.0\ninfo:\n  title: Test\n  version: "1"\npaths: {}' },
}

function mockGroq(fail: Set<string> = new Set()) {
  const names: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as {
        response_format?: { json_schema?: { name?: string } }
      }
      const name = body.response_format?.json_schema?.name ?? 'text'
      names.push(name)
      if (fail.has(name)) return new Response('{"error":{"message":"boom"}}', { status: 500 })
      const content = name.endsWith('_report') ? { summary: 'ok', findings: [finding([1])] } : ANSWERS[name]
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(content) } }],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-ratelimit-remaining-tokens': '7000' },
        },
      )
    }),
  )
  return names
}

let seq = 0
function useKeys(n: number) {
  seq++
  useAiSettings
    .getState()
    .setKeys(Array.from({ length: n }, (_, i) => `gsk_autopilot${seq}x${i}abcdefghijklmn${i}${seq}`))
  useAiSettings.getState().setConsent(true)
}

const capture = () => [
  entry(1, { url: 'https://api.shop.com/v2/recs', status: 503, wait: 2900, time: 3000 }),
  entry(2, { url: 'https://api.shop.com/v2/users/7', wait: 900, time: 1000, start: 10 }),
  entry(3, { url: 'https://shop.com/', mime: 'text/html', wait: 50, start: 0 }),
]

function finalStages(events: AutopilotEvent[]) {
  const last = new Map<string, AutopilotStage>()
  for (const e of events) if (e.type === 'stage') last.set(e.stage.id, e.stage)
  return Object.fromEntries([...last].map(([id, s]) => [id, s.state]))
}

beforeEach(() => {
  vi.unstubAllGlobals()
  explainCache.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('autopilot', () => {
  it('picks failures first, then slow TTFB, one per URL', () => {
    const picked = pickExplainTargets([
      ...capture(),
      entry(4, { url: 'https://api.shop.com/v2/recs', status: 503 }),
    ])
    expect(picked.map((e) => e.id)).toEqual([1, 2, 3])
  })

  it('runs every stage and fills the explain cache', async () => {
    useKeys(2)
    const names = mockGroq()
    const events: AutopilotEvent[] = []
    const result = await runAutopilot(capture(), 'test:3', (e) => events.push(e))

    expect(finalStages(events)).toEqual({
      specialists: 'done',
      lead: 'done',
      explain: 'done',
      views: 'done',
      openapi: 'done',
    })
    expect(names).toEqual(
      expect.arrayContaining(['diagnosis', 'request_explanation', 'suggested_views', 'openapi']),
    )
    expect(result.explained).toEqual(expect.arrayContaining([1, 2]))
    expect(explainCache.get(1)?.data.verdict).toContain('503')
    expect(result.suggestions).toEqual([
      { label: 'Failures', reason: '1 request failed', criteria: { statuses: ['5xx'] } },
    ])
    expect(result.openapi).toMatch(/^openapi:/)
    expect(events.at(-1)).toEqual({ type: 'done', result })
  })

  it('keeps going when one stage fails', async () => {
    useKeys(1)
    mockGroq(new Set(['suggested_views']))
    const events: AutopilotEvent[] = []
    const result = await runAutopilot(capture(), 'test:3', (e) => events.push(e))
    const stages = finalStages(events)
    expect(stages.views).toBe('failed')
    expect(stages.lead).toBe('done')
    expect(stages.explain).toBe('done')
    expect(result.suggestions).toEqual([])
  })
})
