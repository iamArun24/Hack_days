import { describe, expect, it } from 'vitest'
import { groupEndpoints, normalizePath, partyBreakdown, percentile, registrableDomain } from './endpoints'
import { profilePerformance, summarize } from './metrics'
import { detectIssues } from './issues'
import { healthScore, ramp } from './score'
import { auditSecurity, gradeOf, responseCookies } from './security'
import { entry } from './test-utils'

const mk = (o: Parameters<typeof entry>[1] = {}, id = 0) => entry(id, o)

describe('endpoints', () => {
  it('normalizes variable path segments', () => {
    expect(normalizePath('/users/42/posts?page=2')).toBe('/users/:id/posts')
    expect(normalizePath('/o/3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe('/o/:uuid')
    expect(normalizePath('/blob/a94a8fe5ccb19ba61c4c0873d391e987')).toBe('/blob/:hash')
    expect(normalizePath('/day/2026-10-17')).toBe('/day/:date')
    expect(normalizePath('/')).toBe('/')
  })

  it('computes nearest-rank percentiles', () => {
    const v = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    expect(percentile(v, 50)).toBe(50)
    expect(percentile(v, 95)).toBe(100)
    expect(percentile([], 50)).toBe(0)
  })

  it('groups API calls by pattern with stats', () => {
    const entries = [
      mk({ url: 'https://api.x.com/users/1', mime: 'application/json', time: 100 }, 0),
      mk({ url: 'https://api.x.com/users/2', mime: 'application/json', time: 300, status: 500 }, 1),
      mk({ url: 'https://x.com/app.js', mime: 'application/javascript' }, 2),
    ]
    const groups = groupEndpoints(entries)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ pattern: '/users/:id', count: 2, errors: 1, p50: 100, max: 300 })
    expect(groupEndpoints(entries, { apiOnly: false })).toHaveLength(2)
  })

  it('derives registrable domains and party split', () => {
    expect(registrableDomain('cdn.assets.example.com')).toBe('example.com')
    expect(registrableDomain('www.bbc.co.uk')).toBe('bbc.co.uk')
    expect(registrableDomain('localhost:5173')).toBe('localhost')
    const rows = partyBreakdown([
      mk({ url: 'https://www.shop.com/', mime: 'text/html', start: 0 }, 0),
      mk({ url: 'https://cdn.shop.com/a.js', start: 10 }, 1),
      mk({ url: 'https://tracker.io/p', start: 20 }, 2),
    ])
    expect(rows[0]).toMatchObject({ domain: 'shop.com', firstParty: true, count: 2 })
    expect(rows[1]).toMatchObject({ domain: 'tracker.io', firstParty: false })
  })
})

describe('security', () => {
  it('parses Set-Cookie flags', () => {
    const e = mk({
      responseHeaders: [{ name: 'Set-Cookie', value: 'sid=1; Path=/; Secure; HttpOnly; SameSite=Lax' }],
    })
    expect(responseCookies(e)).toEqual([{ name: 'sid', secure: true, httpOnly: true, sameSite: 'lax' }])
  })

  it('flags secrets, plain HTTP credentials and weak cookies', () => {
    const report = auditSecurity([
      mk({ url: 'https://a.com/cb?access_token=abc', mime: 'text/html' }, 0),
      mk({ url: 'http://a.com/login', requestHeaders: [{ name: 'Authorization', value: 'Basic x' }] }, 1),
      mk(
        { url: 'https://a.com/s', responseHeaders: [{ name: 'set-cookie', value: 'id=2; SameSite=None' }] },
        2,
      ),
    ])
    const ids = report.findings.filter((f) => f.items.length).map((f) => f.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'secrets-in-url',
        'credentials-http',
        'insecure-transport',
        'cookie-secure',
        'cookie-samesite',
      ]),
    )
    expect(report.score).toBeLessThan(70)
    expect(report.transport).toEqual({ secure: 2, insecure: 1 })
  })

  it('scores a hardened capture highly', () => {
    const headers = [
      'strict-transport-security',
      'content-security-policy',
      'x-content-type-options',
      'x-frame-options',
      'referrer-policy',
      'permissions-policy',
    ].map((name) => ({ name, value: 'x' }))
    const report = auditSecurity([mk({ url: 'https://a.com/', mime: 'text/html', responseHeaders: headers })])
    expect(report.grade).toBe('A')
    expect(report.headers.every((h) => h.present === h.total)).toBe(true)
  })

  it('maps scores to grades', () => {
    expect(gradeOf(95)).toBe('A')
    expect(gradeOf(80)).toBe('B')
    expect(gradeOf(10)).toBe('F')
  })
})

describe('health score', () => {
  it('ramps between good and bad', () => {
    expect(ramp(100, 200, 1200)).toBe(1)
    expect(ramp(1200, 200, 1200)).toBe(0)
    expect(ramp(700, 200, 1200)).toBeCloseTo(0.5)
  })

  it('rewards a fast, healthy capture and penalizes a broken one', () => {
    const score = (entries: ReturnType<typeof entry>[]) =>
      healthScore(entries, summarize(entries, null), profilePerformance(entries), detectIssues(entries)).score
    const fast = [mk({ time: 80, wait: 40 }, 0), mk({ time: 90, wait: 50, start: 10 }, 1)]
    const slow = [
      mk({ time: 6000, wait: 3000, status: 500 }, 0),
      mk({ time: 5000, wait: 2500, status: 0 }, 1),
    ]
    expect(score(fast)).toBeGreaterThan(80)
    expect(score(slow)).toBeLessThan(50)
  })
})
