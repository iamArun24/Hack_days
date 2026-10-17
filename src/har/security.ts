import { findHeader } from './parse'
import type { Entry } from './types'

export type SecuritySeverity = 'high' | 'medium' | 'low'
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface SecurityItem {
  entry: Entry
  detail: string
}

export interface SecurityFinding {
  id: string
  title: string
  description: string
  severity: SecuritySeverity
  items: SecurityItem[]
}

export interface HeaderCoverage {
  header: string
  label: string
  description: string
  present: number
  total: number
}

export interface CookieStats {
  total: number
  secure: number
  httpOnly: number
  sameSite: number
}

export interface SecurityReport {
  score: number
  grade: Grade
  findings: SecurityFinding[]
  headers: HeaderCoverage[]
  cookies: CookieStats
  transport: { secure: number; insecure: number }
}

const LOCAL_HOST = /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/i
const SECRET_PARAM =
  /^(access_?token|id_?token|token|api_?key|apikey|key|secret|client_secret|password|passwd|pwd|auth|session(_?id)?|sid|jwt|signature|sig)$/i

const isHttp = (e: Entry) => e.url.startsWith('http://') && !LOCAL_HOST.test(e.host)
const ok = (e: Entry) => e.status >= 200 && e.status < 400

/** Security headers that matter on documents, with the reason each one exists. */
export const SECURITY_HEADERS: ReadonlyArray<Omit<HeaderCoverage, 'present' | 'total'>> = [
  {
    header: 'strict-transport-security',
    label: 'HSTS',
    description: 'Forces HTTPS on future visits and blocks protocol downgrade attacks.',
  },
  {
    header: 'content-security-policy',
    label: 'Content-Security-Policy',
    description: 'Restricts where scripts, styles and frames may load from — the main XSS defence.',
  },
  {
    header: 'x-content-type-options',
    label: 'X-Content-Type-Options',
    description: '`nosniff` stops browsers from guessing MIME types and executing data as script.',
  },
  {
    header: 'x-frame-options',
    label: 'Clickjacking protection',
    description: 'X-Frame-Options or CSP frame-ancestors prevents the page being framed by others.',
  },
  {
    header: 'referrer-policy',
    label: 'Referrer-Policy',
    description: 'Controls how much of the URL leaks to other sites through the Referer header.',
  },
  {
    header: 'permissions-policy',
    label: 'Permissions-Policy',
    description: 'Disables powerful browser features (camera, geolocation…) the page does not need.',
  },
]

function hasHeader(e: Entry, header: string): boolean {
  const headers = e.raw.response?.headers
  if (header === 'x-frame-options') {
    return (
      !!findHeader(headers, header) ||
      /frame-ancestors/i.test(findHeader(headers, 'content-security-policy') ?? '')
    )
  }
  return !!findHeader(headers, header)
}

/** HTML documents are what security headers protect; fall back to every successful response. */
export function securityTargets(entries: readonly Entry[]): Entry[] {
  const docs = entries.filter((e) => e.type === 'html' && ok(e))
  return docs.length ? docs : entries.filter(ok)
}

export function headerCoverage(entries: readonly Entry[]): HeaderCoverage[] {
  const targets = securityTargets(entries)
  return SECURITY_HEADERS.map((h) => ({
    ...h,
    total: targets.length,
    present: targets.filter((e) =>
      h.header === 'strict-transport-security' && isHttp(e) ? false : hasHeader(e, h.header),
    ).length,
  }))
}

export interface ParsedCookie {
  name: string
  secure: boolean
  httpOnly: boolean
  sameSite: string | null
}

/** Set-Cookie headers carry the flags; HAR's `cookies` array is the fallback. */
export function responseCookies(e: Entry): ParsedCookie[] {
  const headers = e.raw.response?.headers ?? []
  const fromHeaders = headers
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .flatMap((h) => h.value.split('\n'))
    .filter(Boolean)
    .map((line) => {
      const [pair = '', ...attrs] = line.split(';').map((p) => p.trim())
      const lower = attrs.map((a) => a.toLowerCase())
      const sameSite = lower.find((a) => a.startsWith('samesite='))?.slice(9) ?? null
      return {
        name: pair.split('=')[0] ?? '',
        secure: lower.includes('secure'),
        httpOnly: lower.includes('httponly'),
        sameSite,
      }
    })
  if (fromHeaders.length) return fromHeaders
  return (e.raw.response?.cookies ?? []).map((c) => ({
    name: c.name,
    secure: !!c.secure,
    httpOnly: !!c.httpOnly,
    sameSite: c.sameSite ? c.sameSite.toLowerCase() : null,
  }))
}

function secretParams(url: string): string[] {
  try {
    return [...new URL(url).searchParams.keys()].filter((k) => SECRET_PARAM.test(k))
  } catch {
    return []
  }
}

type CheckDefinition = Omit<SecurityFinding, 'items'> & { run: (entries: readonly Entry[]) => SecurityItem[] }

const CHECKS: CheckDefinition[] = [
  {
    id: 'credentials-http',
    title: 'Credentials over plain HTTP',
    severity: 'high',
    description: 'Authorization headers or cookies sent without TLS can be read by anyone on the network.',
    run: (entries) =>
      entries
        .filter((e) => isHttp(e))
        .filter(
          (e) =>
            findHeader(e.raw.request.headers, 'authorization') || findHeader(e.raw.request.headers, 'cookie'),
        )
        .map((entry) => ({
          entry,
          detail: findHeader(entry.raw.request.headers, 'authorization') ? 'Authorization' : 'Cookie',
        })),
  },
  {
    id: 'secrets-in-url',
    title: 'Secrets in URLs',
    severity: 'high',
    description: 'Tokens and keys in query strings end up in logs, history and Referer headers.',
    run: (entries) =>
      entries.flatMap((entry) => {
        const keys = secretParams(entry.url)
        return keys.length ? [{ entry, detail: keys.join(', ') }] : []
      }),
  },
  {
    id: 'cors-credentials',
    title: 'Wildcard CORS with credentials',
    severity: 'high',
    description:
      'Access-Control-Allow-Origin: * combined with credentials is rejected by browsers and signals a misconfiguration.',
    run: (entries) =>
      entries
        .filter((e) => {
          const h = e.raw.response?.headers
          return (
            findHeader(h, 'access-control-allow-origin') === '*' &&
            /true/i.test(findHeader(h, 'access-control-allow-credentials') ?? '')
          )
        })
        .map((entry) => ({ entry, detail: 'ACAO * + credentials' })),
  },
  {
    id: 'insecure-transport',
    title: 'Insecure transport',
    severity: 'medium',
    description: 'Requests made over plain HTTP can be tampered with in transit.',
    run: (entries) => entries.filter(isHttp).map((entry) => ({ entry, detail: 'http://' })),
  },
  {
    id: 'cookie-secure',
    title: 'Cookies without Secure',
    severity: 'medium',
    description: 'Cookies set over HTTPS without the Secure flag may also be sent over plain HTTP.',
    run: (entries) =>
      entries.flatMap((entry) =>
        entry.url.startsWith('https://')
          ? responseCookies(entry)
              .filter((c) => !c.secure)
              .map((c) => ({ entry, detail: c.name }))
          : [],
      ),
  },
  {
    id: 'cookie-samesite',
    title: 'SameSite=None without Secure',
    severity: 'medium',
    description: 'Browsers reject SameSite=None cookies that are not also marked Secure.',
    run: (entries) =>
      entries.flatMap((entry) =>
        responseCookies(entry)
          .filter((c) => c.sameSite === 'none' && !c.secure)
          .map((c) => ({ entry, detail: c.name })),
      ),
  },
  {
    id: 'cookie-httponly',
    title: 'Cookies readable by scripts',
    severity: 'low',
    description:
      'Cookies without HttpOnly can be stolen by any injected script. Session cookies should always set it.',
    run: (entries) =>
      entries.flatMap((entry) =>
        responseCookies(entry)
          .filter((c) => !c.httpOnly)
          .map((c) => ({ entry, detail: c.name })),
      ),
  },
  {
    id: 'cors-wildcard',
    title: 'Wildcard CORS',
    severity: 'low',
    description: 'Any origin may read these responses. Fine for public assets, risky for private APIs.',
    run: (entries) =>
      entries
        .filter(
          (e) =>
            (e.type === 'json' || e.type === 'xml') &&
            findHeader(e.raw.response?.headers, 'access-control-allow-origin') === '*',
        )
        .map((entry) => ({ entry, detail: 'ACAO *' })),
  },
  {
    id: 'version-disclosure',
    title: 'Server version disclosure',
    severity: 'low',
    description: 'Server and X-Powered-By headers with versions help attackers find known vulnerabilities.',
    run: (entries) => {
      const seen = new Set<string>()
      return entries.flatMap((entry) => {
        const h = entry.raw.response?.headers
        const server = findHeader(h, 'server')
        const powered = findHeader(h, 'x-powered-by')
        const leak = powered ?? (server && /\d/.test(server) ? server : undefined)
        if (!leak) return []
        const key = `${entry.host} ${leak}`
        if (seen.has(key)) return []
        seen.add(key)
        return [{ entry, detail: leak }]
      })
    },
  },
]

const WEIGHT: Record<SecuritySeverity, { base: number; per: number; cap: number }> = {
  high: { base: 14, per: 2, cap: 24 },
  medium: { base: 7, per: 1, cap: 12 },
  low: { base: 2, per: 0.5, cap: 5 },
}

export function gradeOf(score: number): Grade {
  if (score >= 90) return 'A'
  if (score >= 78) return 'B'
  if (score >= 64) return 'C'
  if (score >= 50) return 'D'
  return 'F'
}

export function auditSecurity(entries: readonly Entry[]): SecurityReport {
  const findings = CHECKS.map(({ run, ...check }) => ({ ...check, items: run(entries) }))
  const headers = headerCoverage(entries)

  let penalty = 0
  for (const f of findings) {
    if (!f.items.length) continue
    const w = WEIGHT[f.severity]
    penalty += Math.min(w.cap, w.base + w.per * (f.items.length - 1))
  }
  for (const h of headers) if (h.total) penalty += 4 * (1 - h.present / h.total)

  let total = 0
  let secure = 0
  let httpOnly = 0
  let sameSite = 0
  for (const e of entries) {
    for (const c of responseCookies(e)) {
      total++
      if (c.secure) secure++
      if (c.httpOnly) httpOnly++
      if (c.sameSite) sameSite++
    }
  }

  const insecure = entries.filter(isHttp).length
  const score = entries.length ? Math.max(0, Math.min(100, Math.round(100 - penalty))) : 100
  return {
    score,
    grade: gradeOf(score),
    findings,
    headers,
    cookies: { total, secure, httpOnly, sameSite },
    transport: { secure: entries.length - insecure, insecure },
  }
}
