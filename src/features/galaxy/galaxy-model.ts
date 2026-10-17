import { registrableDomain } from '@/har/endpoints'
import { statusGroup } from '@/har/parse'
import type { Entry, StatusGroup } from '@/har/types'

/** How many hosts get their own planet; the long tail shares one "others" planet. */
export const MAX_PLANETS = 14
/** Instanced moons are cheap, but a frame still updates every matrix. */
export const MAX_MOONS = 12000

export type PlanetKind = 'first' | 'third' | 'others'

export interface Planet {
  key: string
  label: string
  kind: PlanetKind
  count: number
  bytes: number
  errors: number
  orbitRadius: number
  size: number
  angle0: number
  /** Radians per second. */
  speed: number
  tilt: number
}

export interface Moon {
  entry: Entry
  /** Index into `planets`, or -1 for requests to the sun (the document host). */
  planet: number
  group: StatusGroup
  size: number
  orbitRadius: number
  phase: number
  speed: number
  incline: number
  /** Offset from the capture start, in ms. */
  start: number
}

export interface GalaxyModel {
  sun: { host: string; count: number; bytes: number }
  planets: Planet[]
  moons: Moon[]
  /** Capture duration in ms (last request end). */
  duration: number
  truncated: boolean
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/** Small deterministic hash → [0, 1) so moon placement is stable across re-renders. */
function hash01(n: number): number {
  let x = (n + 0x9e3779b9) | 0
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b)
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

const bytesOf = (e: Entry) => Math.max(0, e.transferSize > 0 ? e.transferSize : e.size)

export function buildGalaxy(input: readonly Entry[]): GalaxyModel {
  const truncated = input.length > MAX_MOONS
  const entries = (truncated ? input.slice(0, MAX_MOONS) : input).toSorted(
    (a, b) => a.startTime - b.startTime,
  )
  if (!entries.length) {
    return { sun: { host: '', count: 0, bytes: 0 }, planets: [], moons: [], duration: 0, truncated }
  }

  const origin = entries[0]!.startTime
  const doc = entries.find((e) => e.type === 'html') ?? entries[0]!
  const sunHost = doc.host
  const site = registrableDomain(sunHost)

  // Hosts other than the sun, ranked by request count.
  const hosts = new Map<string, { count: number; bytes: number; errors: number; first: number }>()
  for (const e of entries) {
    if (e.host === sunHost) continue
    const h = hosts.get(e.host) ?? { count: 0, bytes: 0, errors: 0, first: e.startTime }
    h.count++
    h.bytes += bytesOf(e)
    if (e.status >= 400 || e.status === 0) h.errors++
    hosts.set(e.host, h)
  }
  const ranked = [...hosts].sort((a, b) => b[1].count - a[1].count)
  const own = ranked.slice(0, MAX_PLANETS)
  const tail = ranked.slice(MAX_PLANETS)

  type Draft = Omit<Planet, 'orbitRadius' | 'size' | 'angle0' | 'speed' | 'tilt'> & { first: number }
  const drafts: Draft[] = own.map(([host, h]) => ({
    key: host,
    label: host || '(none)',
    kind: registrableDomain(host) === site ? 'first' : 'third',
    count: h.count,
    bytes: h.bytes,
    errors: h.errors,
    first: h.first,
  }))
  if (tail.length) {
    drafts.push({
      key: '__others__',
      label: `${tail.length} other host${tail.length === 1 ? '' : 's'}`,
      kind: 'others',
      count: tail.reduce((n, [, h]) => n + h.count, 0),
      bytes: tail.reduce((n, [, h]) => n + h.bytes, 0),
      errors: tail.reduce((n, [, h]) => n + h.errors, 0),
      first: Math.min(...tail.map(([, h]) => h.first)),
    })
  }

  // Orbits are ordered by when the host was first contacted: the page "reaches outward" over time.
  drafts.sort((a, b) => a.first - b.first)
  const maxBytes = Math.max(1, ...drafts.map((d) => d.bytes))
  const planets: Planet[] = drafts.map(({ first: _first, ...d }, i) => {
    const orbitRadius = 8 + i * 2.9
    return {
      ...d,
      orbitRadius,
      size: 0.42 + 0.95 * Math.sqrt(d.bytes / maxBytes),
      angle0: i * GOLDEN_ANGLE * 2.4,
      speed: 0.32 / Math.sqrt(orbitRadius),
      tilt: (hash01(i * 7 + 3) - 0.5) * 0.35,
    }
  })

  const planetIndex = new Map(planets.map((p, i) => [p.key, i]))
  const othersIndex = planetIndex.get('__others__') ?? -1
  const perPlanet = new Map<number, number>()

  let duration = 0
  let sunBytes = 0
  let sunCount = 0
  const moons: Moon[] = entries.map((entry) => {
    const planet = entry.host === sunHost ? -1 : (planetIndex.get(entry.host) ?? othersIndex)
    const k = perPlanet.get(planet) ?? 0
    perPlanet.set(planet, k + 1)
    const r1 = hash01(entry.id * 3 + 1)
    const r2 = hash01(entry.id * 3 + 2)
    const parentSize = planet === -1 ? 1.4 : planets[planet]!.size
    const shell = planet === -1 ? 1.2 + (k % 9) * 0.42 : 0.35 + (k % 6) * 0.22
    if (planet === -1) {
      sunCount++
      sunBytes += bytesOf(entry)
    }
    duration = Math.max(duration, entry.startTime - origin + Math.max(0, entry.time))
    const size = Math.min(0.24, Math.max(0.055, 0.03 * Math.log10(Math.max(10, entry.size))))
    return {
      entry,
      planet,
      group: statusGroup(entry.status),
      size,
      orbitRadius: parentSize + shell + r1 * 0.25,
      phase: r2 * Math.PI * 2,
      speed: (0.5 + r1 * 0.7) / Math.sqrt(parentSize + shell),
      incline: (r2 - 0.5) * 1.6,
      start: entry.startTime - origin,
    }
  })

  return { sun: { host: sunHost, count: sunCount, bytes: sunBytes }, planets, moons, duration, truncated }
}
