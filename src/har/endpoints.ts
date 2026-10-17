import type { Entry } from './types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMERIC = /^\d+$/
const HEX = /^[0-9a-f]{16,}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TOKENISH = /^(?=.*\d)(?=.*[a-z])[\w-]{20,}$/i

/** Collapses variable path segments so `/users/42/posts` and `/users/7/posts` group together. */
export function normalizePath(path: string): string {
  const pathname = path.split(/[?#]/)[0] ?? ''
  const segments = pathname.split('/').map((seg) => {
    if (!seg) return seg
    if (NUMERIC.test(seg)) return ':id'
    if (UUID.test(seg)) return ':uuid'
    if (DATE.test(seg)) return ':date'
    if (HEX.test(seg)) return ':hash'
    if (TOKENISH.test(seg)) return ':token'
    return seg
  })
  return segments.join('/') || '/'
}

/** Nearest-rank percentile over an ascending array. */
export function percentile(sorted: readonly number[], p: number): number {
  if (!sorted.length) return 0
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]!
}

/** Requests that look like API traffic rather than static assets. */
export function isApiLike(e: Entry): boolean {
  if (e.method !== 'GET' && e.method !== 'HEAD') return e.method !== 'OPTIONS'
  if (e.type === 'json' || e.type === 'xml') return true
  return /\/(api|graphql|rest|rpc|v\d+)(\/|$)/i.test(e.path)
}

export interface Endpoint {
  key: string
  method: string
  host: string
  pattern: string
  count: number
  errors: number
  errorRate: number
  avg: number
  min: number
  p50: number
  p95: number
  max: number
  bytes: number
  statuses: number[]
  ids: number[]
}

export function groupEndpoints(entries: readonly Entry[], { apiOnly = true } = {}): Endpoint[] {
  const groups = new Map<string, Entry[]>()
  for (const e of entries) {
    if (apiOnly && !isApiLike(e)) continue
    const key = `${e.method} ${e.host}${normalizePath(e.path)}`
    const list = groups.get(key)
    if (list) list.push(e)
    else groups.set(key, [e])
  }

  return [...groups].map(([key, list]) => {
    const times = list.map((e) => e.time).sort((a, b) => a - b)
    const errors = list.filter((e) => e.status >= 400 || e.status === 0).length
    const first = list[0]!
    return {
      key,
      method: first.method,
      host: first.host,
      pattern: normalizePath(first.path),
      count: list.length,
      errors,
      errorRate: errors / list.length,
      avg: times.reduce((a, b) => a + b, 0) / times.length,
      min: times[0] ?? 0,
      p50: percentile(times, 50),
      p95: percentile(times, 95),
      max: times[times.length - 1] ?? 0,
      bytes: list.reduce((n, e) => n + Math.max(0, e.size), 0),
      statuses: [...new Set(list.map((e) => e.status))].sort((a, b) => a - b),
      ids: list.map((e) => e.id),
    }
  })
}

const MULTI_PART_SUFFIX = /^(co|com|net|org|gov|edu|ac)$/

/** Approximate registrable domain (eTLD+1) without shipping the public suffix list. */
export function registrableDomain(host: string): string {
  const bare = host.replace(/:\d+$/, '').toLowerCase()
  if (/^[\d.]+$/.test(bare) || bare.startsWith('[')) return bare
  const parts = bare.split('.')
  if (parts.length <= 2) return bare
  const tld = parts[parts.length - 1]!
  const sld = parts[parts.length - 2]!
  const take = tld.length === 2 && MULTI_PART_SUFFIX.test(sld) ? 3 : 2
  return parts.slice(-take).join('.')
}

export interface PartyRow {
  domain: string
  firstParty: boolean
  count: number
  bytes: number
  time: number
}

/** The first document's site counts as first-party; everything else is a third party. */
export function partyBreakdown(entries: readonly Entry[]): PartyRow[] {
  if (!entries.length) return []
  const sorted = entries.toSorted((a, b) => a.startTime - b.startTime)
  const doc = sorted.find((e) => e.type === 'html') ?? sorted[0]!
  const site = registrableDomain(doc.host)
  const rows = new Map<string, PartyRow>()
  for (const e of entries) {
    const domain = registrableDomain(e.host) || '(none)'
    const row = rows.get(domain) ?? { domain, firstParty: domain === site, count: 0, bytes: 0, time: 0 }
    row.count++
    row.bytes += Math.max(0, e.transferSize > 0 ? e.transferSize : e.size)
    row.time += e.time
    rows.set(domain, row)
  }
  return [...rows.values()].sort((a, b) => Number(b.firstParty) - Number(a.firstParty) || b.count - a.count)
}
