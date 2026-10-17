import { groupEndpoints, partyBreakdown } from '@/har/endpoints'
import { sanitizeEntries } from '@/har/export/har'
import { detectIssues } from '@/har/issues'
import { profilePerformance, summarize, topBy } from '@/har/metrics'
import { auditSecurity } from '@/har/security'
import type { Entry, HarNameValue } from '@/har/types'
import { formatBytes } from '@/lib/format'

/*
 * Everything sent to the model passes through here. Captures carry credentials, so values are
 * redacted twice: structurally (sanitizeEntries: auth headers, cookies, secret params) and
 * textually (JWTs, bearer tokens, emails, long opaque tokens anywhere in the text).
 */

const SECRET_PARAM = /token|key|secret|signature|sig|auth|session|code|password|passwd|pwd|jwt|nonce|state/i

/** Masks secrets that survive structural redaction (inside bodies, paths, free text). */
export function maskText(text: string): string {
  return text
    .replace(/eyJ[\w-]{6,}\.[\w-]{6,}\.[\w-]{4,}/g, '[JWT]')
    .replace(/\b(Bearer|Basic|Token)\s+[\w.~+/=-]{8,}/gi, '$1 [REDACTED]')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .replace(/\b(?:sk|pk|rk|gsk|ghp|gho|xox[abp]|AKIA)[_-]?[A-Za-z0-9_-]{12,}/g, '[secret]')
    .replace(/\b[a-f0-9]{32,}\b/gi, '[hex]')
    .replace(/[A-Za-z0-9+_-]{40,}={0,2}/g, (m) => (/\d/.test(m) && /[A-Za-z]/.test(m) ? '[token]' : m))
}

export function redactUrl(url: string): string {
  try {
    const u = new URL(url)
    for (const key of [...u.searchParams.keys()])
      if (SECRET_PARAM.test(key)) u.searchParams.set(key, 'REDACTED')
    u.username = ''
    u.password = ''
    return maskText(decodeURI(u.toString()))
  } catch {
    return maskText(url)
  }
}

const ms = (v: number) =>
  !Number.isFinite(v) || v < 0 ? '—' : v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`

const shortUrl = (e: Entry, max = 90) => {
  try {
    const u = new URL(redactUrl(e.url))
    const s = `${u.host}${u.pathname}${u.search}`
    return s.length > max ? `${s.slice(0, max - 1)}…` : s
  } catch {
    return redactUrl(e.url).slice(0, max)
  }
}

/** `#12 GET 503 api.x.com/v2/recs 3.03s ttfb 2.90s 112 B json @+1.20s` */
export function entryLine(e: Entry, start: number): string {
  const size = e.size >= 0 ? formatBytes(e.size) : '?'
  return `#${e.id} ${e.method} ${e.status || 'FAILED'} ${shortUrl(e)} ${ms(e.time)} ttfb ${ms(e.timings.wait)} ${size} ${e.type} @+${ms(e.startTime - start)}`
}

const lines = (title: string, entries: readonly Entry[], start: number) =>
  entries.length ? [`${title}:`, ...entries.map((e) => `  ${entryLine(e, start)}`)] : []

const ids = (entries: readonly Entry[], max = 8) =>
  entries
    .slice(0, max)
    .map((e) => `#${e.id}`)
    .join(',') + (entries.length > max ? ` +${entries.length - max}` : '')

/** Compact capture summary for the agents (≈2.5K tokens), every request referenced by id. */
export function captureDigest(entries: readonly Entry[], budget = 11_000): string {
  if (!entries.length) return 'CAPTURE: empty (no requests).'
  const start = Math.min(...entries.map((e) => e.startTime))
  const s = summarize(entries, null)
  const p = profilePerformance(entries)
  const failed = entries.filter((e) => e.status >= 400 || e.status === 0)

  const out: string[] = [
    `CAPTURE: ${s.requests} requests · ${s.domains} hosts · ${formatBytes(s.transferredBytes)} transferred (${formatBytes(s.contentBytes)} decoded) · finish ${ms(s.finish)} · ${failed.length} failed`,
    `PHASE AVERAGES: ${p.avgPhases.map((ph) => `${ph.label} ${ms(ph.avg)}`).join(' · ')}`,
    `TRANSPORT: http versions ${p.httpVersions.map((v) => `${v.version}×${v.count}`).join(', ')} · connections ${p.connections || '?'} · 304s ${p.cached} (hit ratio ${(p.cacheHitRatio * 100).toFixed(0)}%) · compressed ${p.compressed}/${p.compressed + p.uncompressed} · redirects ${p.redirects} · CORS preflights ${p.preflights}`,
    '',
    ...lines(
      'FIRST REQUESTS (critical path)',
      entries.toSorted((a, b) => a.startTime - b.startTime).slice(0, 8),
      start,
    ),
    ...lines(
      'SLOWEST',
      topBy(entries, (e) => e.time, 8),
      start,
    ),
    ...lines(
      'SLOWEST TTFB',
      topBy(entries, (e) => e.timings.wait, 5),
      start,
    ),
    ...lines('FAILURES', failed.slice(0, 15), start),
    ...lines(
      'LARGEST',
      topBy(entries, (e) => e.size, 6),
      start,
    ),
  ]

  const issues = detectIssues(entries).filter((c) => c.items.length)
  if (issues.length) {
    out.push('AUTOMATED CHECKS:')
    for (const c of issues)
      out.push(`  ${c.title} [${c.severity}] ×${c.items.length}: ${ids(c.items.map((i) => i.entries[0]!))}`)
  }

  const sec = auditSecurity(entries)
  const missing = sec.headers
    .filter((h) => h.total && h.present < h.total)
    .map((h) => `${h.label} ${h.present}/${h.total}`)
  out.push(
    `SECURITY: grade ${sec.grade} (${sec.score}/100) · HTTPS ${sec.transport.secure}/${sec.transport.secure + sec.transport.insecure} · cookies ${sec.cookies.total} (Secure ${sec.cookies.secure}, HttpOnly ${sec.cookies.httpOnly}, SameSite ${sec.cookies.sameSite})${missing.length ? ` · missing/partial headers: ${missing.join(', ')}` : ''}`,
  )
  for (const f of sec.findings.filter((x) => x.items.length))
    out.push(
      `  ${f.title} [${f.severity}] ×${f.items.length}: ${f.items
        .slice(0, 5)
        .map((i) => `#${i.entry.id}(${maskText(i.detail).slice(0, 40)})`)
        .join(', ')}`,
    )

  const endpoints = groupEndpoints(entries)
    .toSorted((a, b) => b.count * b.p95 - a.count * a.p95)
    .slice(0, 12)
  if (endpoints.length) {
    out.push('API ENDPOINTS (method host+pattern ×calls p50/p95 errors ids):')
    for (const ep of endpoints)
      out.push(
        `  ${ep.method} ${maskText(ep.host + ep.pattern)} ×${ep.count} ${ms(ep.p50)}/${ms(ep.p95)} err ${(ep.errorRate * 100).toFixed(0)}% [${ep.statuses.join(',')}] ${ep.ids
          .slice(0, 6)
          .map((i) => `#${i}`)
          .join(',')}`,
      )
  }

  const parties = partyBreakdown(entries).slice(0, 8)
  if (parties.length)
    out.push(
      `SITES: ${parties.map((r) => `${r.domain}${r.firstParty ? ' (1st)' : ''} ×${r.count} ${formatBytes(r.bytes)}`).join(' · ')}`,
    )

  const text = out.join('\n')
  return text.length > budget ? `${text.slice(0, budget)}\n[…digest truncated]` : text
}

const BODY_LIMIT = 1500

function compactBody(text: string | undefined, mime: string, encoding?: string): string {
  if (!text) return '(empty)'
  if (encoding === 'base64') return `[binary ${mime}, ${text.length} base64 chars]`
  let body = text
  if (/json/i.test(mime) || /^\s*[[{]/.test(text)) {
    try {
      body = JSON.stringify(JSON.parse(text))
    } catch {
      /* keep raw */
    }
  }
  body = maskText(body)
  return body.length > BODY_LIMIT
    ? `${body.slice(0, BODY_LIMIT)}… [${body.length - BODY_LIMIT} more chars]`
    : body
}

const headerLines = (headers: HarNameValue[] | undefined) =>
  (headers ?? [])
    .filter((h) => !h.name.startsWith(':'))
    .map((h) => `  ${h.name}: ${maskText(h.value).slice(0, 200)}`)

/** One request in full detail, redacted, with bodies truncated. */
export function requestDigest(entry: Entry): string {
  const raw = sanitizeEntries([entry.raw])[0]!
  const req = raw.request
  const res = raw.response
  const t = entry.timings
  const out = [
    `REQUEST #${entry.id}`,
    `${entry.method} ${redactUrl(req?.url ?? entry.url)}`,
    `Status: ${entry.status || 'FAILED (no response)'} ${res?.statusText ?? ''} · ${entry.httpVersion || '?'} · type ${entry.type} · ${formatBytes(entry.size)} decoded, ${formatBytes(entry.transferSize)} on the wire`,
    `Timings: total ${ms(entry.time)} · blocked ${ms(t.blocked)} · dns ${ms(t.dns)} · connect ${ms(t.connect)} · tls ${ms(t.ssl)} · send ${ms(t.send)} · wait/ttfb ${ms(t.wait)} · receive ${ms(t.receive)}`,
  ]
  if (entry.raw.serverIPAddress) out.push(`Server IP: ${entry.raw.serverIPAddress}`)
  if (entry.initiator) out.push(`Initiator: ${maskText(entry.initiator).slice(0, 160)}`)
  if (res?.redirectURL) out.push(`Redirects to: ${redactUrl(res.redirectURL)}`)
  out.push('Request headers:', ...headerLines(req?.headers))
  if (req?.postData)
    out.push(
      `Request body (${req.postData.mimeType}):`,
      `  ${compactBody(req.postData.text, req.postData.mimeType)}`,
    )
  out.push('Response headers:', ...headerLines(res?.headers))
  if (res?.content)
    out.push(
      `Response body (${res.content.mimeType}):`,
      `  ${compactBody(res.content.text, res.content.mimeType, res.content.encoding)}`,
    )
  return out.join('\n')
}
