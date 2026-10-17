/**
 * The story script. One request's life, told in acts that map 1:1 onto the HAR timing phases.
 * The film plays on its own: each act lasts `seconds`, and `range` is the slice of the 3D
 * camera path (story progress 0–1) it covers. The scene, captions and the timing bar all
 * read from this table, so retiming an act is a one-line change.
 */
export interface Act {
  id: string
  /** Slice of the camera path this act covers. */
  range: [number, number]
  /** How long the act plays, in seconds. */
  seconds: number
  /** Short chapter name shown on the timing bar. */
  chapter: string
  /** "Step 2 of 5"-style label; empty for the intro and outro. */
  step: string
  title: string
  /** Plain-language explanation of what is happening on screen. */
  explain: string
  /** The HAR field this moment ends up in, shown like a readout. */
  har?: string
  /** Duration shown on the timing bar, as recorded in the sample capture. */
  ms?: number
  /** Tailwind background utility for the act's accent (phase tokens). */
  accent: string
}

export const ACTS: readonly Act[] = [
  {
    id: 'origin',
    range: [0, 0.06],
    seconds: 3.5,
    chapter: 'Start',
    step: '',
    title: 'Every click begins a journey.',
    explain: 'Watch one request travel from your browser to a server and back. Then explore your own.',
    accent: 'bg-primary',
  },
  {
    id: 'request',
    range: [0.06, 0.2],
    seconds: 6,
    chapter: 'Request',
    step: 'Step 1 of 6',
    title: 'You click a button.',
    explain:
      'Your browser packs what it wants (the method, the address, headers and cookies) into a small message called a request.',
    har: 'request: GET /api/cart · 812 B',
    ms: 2,
    accent: 'bg-phase-send',
  },
  {
    id: 'dns',
    range: [0.2, 0.36],
    seconds: 6.5,
    chapter: 'DNS',
    step: 'Step 2 of 6',
    title: 'Finding the address.',
    explain:
      'The browser asks DNS: "where does lumen.dev live?" It is passed from root, to .dev, to lumen.dev, which answers with an IP address.',
    har: 'timings.dns = 24 ms',
    ms: 24,
    accent: 'bg-phase-dns',
  },
  {
    id: 'handshake',
    range: [0.36, 0.52],
    seconds: 7,
    chapter: 'Connect · TLS',
    step: 'Step 3 of 6',
    title: 'Opening a secure line.',
    explain:
      'Three quick messages (SYN, SYN-ACK, ACK) open a connection. Then TLS swaps keys so nobody else can read it. The lock means it is encrypted.',
    har: 'timings.connect = 38 ms · timings.ssl = 41 ms',
    ms: 79,
    accent: 'bg-phase-ssl',
  },
  {
    id: 'wait',
    range: [0.52, 0.66],
    seconds: 6,
    chapter: 'Waiting',
    step: 'Step 4 of 6',
    title: 'The server is thinking.',
    explain:
      'The server reads databases and builds the answer. The ring fills while you wait. This wait is called Time To First Byte (TTFB), and it is often the slowest part.',
    har: 'timings.wait = 212 ms',
    ms: 212,
    accent: 'bg-phase-wait',
  },
  {
    id: 'download',
    range: [0.66, 0.8],
    seconds: 5.5,
    chapter: 'Download',
    step: 'Step 5 of 6',
    title: 'The answer streams back.',
    explain: 'The response arrives as a stream of bytes (HTML, JSON, images) and your page updates.',
    har: 'timings.receive = 64 ms · 48 KB',
    ms: 64,
    accent: 'bg-phase-receive',
  },
  {
    id: 'captured',
    range: [0.8, 0.92],
    seconds: 6.5,
    chapter: 'Recorded',
    step: 'Step 6 of 6',
    title: 'All of it, recorded in a HAR file.',
    explain:
      'DevTools saves every request with its timings into a .har file. Each bar here is one request, and its colours are the steps you just watched.',
    har: 'log.entries · 28 requests',
    accent: 'bg-phase-connect',
  },
  {
    id: 'portal',
    range: [0.92, 1],
    seconds: 3.5,
    chapter: 'Your turn',
    step: '',
    title: 'Now see your own.',
    explain: '',
    accent: 'bg-primary',
  },
]

export const FILM_SECONDS = ACTS.reduce((n, a) => n + a.seconds, 0)

/** Seconds into the film at which each act starts. */
export const ACT_STARTS = ACTS.map((_, i) => ACTS.slice(0, i).reduce((n, a) => n + a.seconds, 0))

/** Film time (s) → act index, local progress within it, and camera-path progress. */
export function filmAt(time: number): { index: number; local: number; p: number } {
  const t = Math.max(0, Math.min(FILM_SECONDS, time))
  let index = ACTS.length - 1
  for (let i = 0; i < ACTS.length; i++) {
    if (t < ACT_STARTS[i]! + ACTS[i]!.seconds) {
      index = i
      break
    }
  }
  const act = ACTS[index]!
  const local = Math.max(0, Math.min(1, (t - ACT_STARTS[index]!) / act.seconds))
  return { index, local, p: act.range[0] + (act.range[1] - act.range[0]) * local }
}
