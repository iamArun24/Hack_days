import type { IssueCheck } from './issues'
import type { CaptureSummary, PerformanceProfile } from './metrics'
import { gradeOf, type Grade } from './security'
import type { Entry } from './types'

export interface ScoreFactor {
  id: string
  label: string
  /** 0–1, higher is better. */
  score: number
  weight: number
  detail: string
}

export interface HealthScore {
  score: number
  grade: Grade
  factors: ScoreFactor[]
  /** Short, plain-language suggestions ordered by impact. */
  tips: string[]
}

/** 1 at or below `good`, 0 at or above `bad`, linear in between. */
export const ramp = (value: number, good: number, bad: number) =>
  Math.max(0, Math.min(1, (bad - value) / (bad - good)))

const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`)

export function healthScore(
  entries: readonly Entry[],
  summary: CaptureSummary,
  profile: PerformanceProfile,
  issues: readonly IssueCheck[],
): HealthScore {
  if (!entries.length) return { score: 100, grade: 'A', factors: [], tips: [] }

  const ttfbs = entries.map((e) => e.timings.wait).filter((v) => v > 0)
  const avgTtfb = ttfbs.length ? ttfbs.reduce((a, b) => a + b, 0) / ttfbs.length : 0
  const errorRatio = summary.errors / summary.requests
  const pageTime = summary.load ?? summary.finish
  const weightMb = summary.transferredBytes / (1024 * 1024)
  const compressible = profile.compressed + profile.uncompressed
  const issueItems = issues.filter((c) => c.severity !== 'info').reduce((n, c) => n + c.items.length, 0)

  const factors: ScoreFactor[] = [
    {
      id: 'ttfb',
      label: 'Server response',
      score: ramp(avgTtfb, 200, 1200),
      weight: 3,
      detail: `Average TTFB ${ms(avgTtfb)}`,
    },
    {
      id: 'errors',
      label: 'Reliability',
      score: ramp(errorRatio, 0, 0.15),
      weight: 3,
      detail: `${(errorRatio * 100).toFixed(1)}% failed`,
    },
    {
      id: 'load',
      label: 'Load time',
      score: ramp(pageTime, 1500, 8000),
      weight: 2,
      detail: `${summary.load ? 'Load' : 'Finish'} at ${ms(pageTime)}`,
    },
    {
      id: 'weight',
      label: 'Page weight',
      score: ramp(weightMb, 1, 8),
      weight: 2,
      detail: `${weightMb.toFixed(2)} MB transferred`,
    },
    {
      id: 'requests',
      label: 'Request count',
      score: ramp(summary.requests, 50, 300),
      weight: 1,
      detail: `${summary.requests} requests`,
    },
    {
      id: 'compression',
      label: 'Compression',
      score: compressible ? profile.compressed / compressible : 1,
      weight: 1,
      detail: `${profile.compressed} of ${compressible} compressed`,
    },
    {
      id: 'issues',
      label: 'Warnings',
      score: ramp(issueItems, 0, 30),
      weight: 2,
      detail: `${issueItems} warning-level findings`,
    },
  ]

  const totalWeight = factors.reduce((n, f) => n + f.weight, 0)
  const score = Math.round((factors.reduce((n, f) => n + f.score * f.weight, 0) / totalWeight) * 100)

  const TIPS: Record<string, string> = {
    ttfb: 'Backend latency dominates — add caching, a CDN edge, or look at slow queries.',
    errors: 'Failed requests are hurting reliability — start with the Issues view.',
    load: 'The page takes a while to settle — defer non-critical scripts and lazy-load media.',
    weight: 'The page is heavy — compress images, split bundles, drop unused code.',
    requests: 'Many requests — bundle small assets and remove unnecessary third parties.',
    compression: 'Some text responses are uncompressed — enable gzip or brotli.',
    issues: 'Several warnings fired — the Issues view lists each one with its requests.',
  }
  const tips = factors
    .filter((f) => f.score < 0.75)
    .sort((a, b) => (1 - b.score) * b.weight - (1 - a.score) * a.weight)
    .map((f) => TIPS[f.id]!)

  return { score, grade: gradeOf(score), factors, tips }
}
