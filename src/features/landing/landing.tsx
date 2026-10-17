import {
  ChartGantt,
  ChevronDown,
  Download,
  FastForward,
  FileUp,
  FlaskConical,
  Gauge,
  GitCompareArrows,
  Lock,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { GithubIcon, LogoMark, REPO_URL } from '@/components/brand'
import { KbdCombo } from '@/components/ui/kbd'
import { useResolvedTheme } from '@/hooks/use-theme'
import { cn } from '@/lib/cn'
import { MOD } from '@/lib/platform'
import { openSample } from '@/services/capture'
import { openFromPicker } from '../command/commands'
import { ThemeMenu } from '../shell/theme-menu'
import { CaptureGuide } from '../welcome/capture-guide'
import { ACT_STARTS, ACTS, FILM_SECONDS, filmAt, type Act } from './acts'
import { Cursor } from './cursor'
import { useKonamiCode, useMagnetic, useTilt } from './motion'
import { StoryScene } from './scene/story-scene'

type IntroPhase = 'loading' | 'assemble' | 'title' | 'done'

/** The six numbered steps shown on the timing bar (intro and outro are not steps). */
const STEPS = ACTS.map((act, index) => ({ act, index })).filter(({ act }) => act.step)

/* ─── Preloader: counter + breathing orb, while chunks load and shaders compile ─── */

function Preloader({ ready, gone }: { ready: boolean; gone: boolean }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let raf = 0
    let value = 0
    const tick = () => {
      // Eases toward 88% on its own; the last stretch waits for the scene.
      value += ((ready ? 100 : 88) - value) * (ready ? 0.18 : 0.035)
      setCount(Math.round(value))
      if (Math.round(value) < 100) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ready])

  return (
    <div
      className={cn(
        'fixed inset-0 z-[90] grid place-items-center bg-background transition-[opacity,visibility] duration-1000',
        gone && 'invisible opacity-0',
      )}
      role="status"
      aria-label="Loading the story"
    >
      <div className="flex flex-col items-center gap-6">
        <div className="relative grid size-28 place-items-center">
          <div className="absolute inset-0 animate-breathe rounded-full bg-[radial-gradient(circle,var(--lavender),transparent_68%)] opacity-80 blur-md" />
          <div className="absolute inset-3 animate-orbit rounded-full border border-dashed border-primary/30" />
          <LogoMark className="relative size-10" />
        </div>
        <p className="font-display text-5xl font-light tracking-tight tabular">{count}</p>
        <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
          Preparing the journey
        </p>
      </div>
    </div>
  )
}

/* ─── Lower third: the opening title, then one caption per step ─── */

function OpeningTitle({ visible }: { visible: boolean }) {
  return (
    <div className="flex flex-col items-center text-center">
      <p
        className={cn(
          'font-mono text-[11px] tracking-[0.22em] text-muted-foreground uppercase transition-all duration-1000',
          visible ? 'opacity-100' : 'translate-y-2 opacity-0',
        )}
      >
        HAR Viewer · Lumen edition
      </p>
      <h1 className="mt-3 font-display text-[clamp(2rem,4.4vw,3.6rem)] leading-[1.12] font-light tracking-tight text-balance">
        {ACTS[0]!.title.split(' ').map((w, i) => (
          <span key={i} className="-mb-[0.2em] inline-block overflow-hidden pb-[0.2em] align-bottom">
            <span
              className={cn(
                'inline-block transition-all duration-[1400ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
                visible
                  ? 'blur-0 translate-y-0 rotate-0 opacity-100'
                  : 'translate-y-[0.8em] rotate-3 opacity-0 blur-sm',
                i >= 3 && 'text-iridescent italic',
              )}
              style={{ transitionDelay: `${i * 110}ms` }}
            >
              {w}&nbsp;
            </span>
          </span>
        ))}
      </h1>
      <p
        className={cn(
          'mt-3 max-w-xl text-[15px] text-pretty text-muted-foreground transition-all delay-700 duration-1000',
          visible ? 'opacity-100' : 'translate-y-3 opacity-0',
        )}
      >
        {ACTS[0]!.explain}
      </p>
    </div>
  )
}

function Caption({ act }: { act: Act }) {
  // Keyed by act, so each step re-mounts and plays its own entrance.
  return (
    <div className="flex animate-rise flex-col items-center text-center">
      <p className="flex items-center gap-2 rounded-full border bg-panel/75 px-3 py-1 font-mono text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase backdrop-blur">
        <span className={cn('size-2 rounded-full', act.accent)} />
        {act.step} · {act.chapter}
      </p>
      <h2 className="mt-3 font-display text-[clamp(1.8rem,3.6vw,2.75rem)] leading-[1.08] font-medium tracking-tight text-balance [text-shadow:0_1px_18px_var(--background)]">
        {act.title}
      </h2>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-pretty text-foreground/75 [text-shadow:0_1px_12px_var(--background)]">
        {act.explain}
      </p>
      {act.har && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-lg border bg-background/70 px-2.5 py-1 font-mono text-xs text-foreground/80 backdrop-blur">
          <span className="text-subtle-foreground">HAR</span>
          <span className={cn('size-1.5 rounded-full', act.accent)} />
          {act.har}
        </p>
      )}
    </div>
  )
}

/* ─── Timing bar: the request's own waterfall row, doubling as the film's progress bar ─── */

function FilmBar({
  index,
  playing,
  fills,
  onToggle,
  onSeek,
  onSkip,
}: {
  index: number
  playing: boolean
  fills: React.RefObject<Array<HTMLSpanElement | null>>
  onToggle: () => void
  onSeek: (act: number) => void
  onSkip: () => void
}) {
  return (
    <div className="flex w-full items-center gap-3 rounded-2xl border border-white/50 p-2 pr-3 shadow-[var(--shadow-lift)] glass dark:border-white/10">
      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[var(--shadow-soft)] outline-none hover:brightness-105 focus-visible:ring-4 focus-visible:ring-ring/30 active:scale-95"
      >
        {playing ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
      </button>

      <ol className="flex min-w-0 flex-1 gap-1" aria-label="Chapters">
        {STEPS.map(({ act, index: i }, n) => (
          <li key={act.id} className="min-w-0" style={{ flex: `${act.seconds} 1 0` }}>
            <button
              type="button"
              onClick={() => onSeek(i)}
              data-cursor="hover"
              aria-current={index === i ? 'step' : undefined}
              className="group flex w-full flex-col gap-1.5 rounded-lg px-1 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <span className="relative block h-2 w-full overflow-hidden rounded-full bg-chart-grid">
                <span
                  ref={(el) => {
                    fills.current[n] = el
                  }}
                  className={cn('absolute inset-y-0 left-0 w-full origin-left rounded-full', act.accent)}
                  style={{ transform: 'scaleX(0)' }}
                />
              </span>
              <span className="flex items-baseline justify-between gap-1 overflow-hidden">
                <span
                  className={cn(
                    'truncate text-[11px] transition-colors',
                    index === i
                      ? 'font-semibold text-foreground'
                      : 'text-muted-foreground group-hover:text-foreground',
                  )}
                >
                  {act.chapter}
                </span>
                {act.ms !== undefined && (
                  <span className="hidden shrink-0 font-mono text-[10px] text-subtle-foreground lg:inline">
                    {act.ms} ms
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={onSkip}
        className="hidden shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground outline-none hover:bg-background/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 sm:inline-flex"
      >
        Skip <FastForward className="size-3.5" />
      </button>
    </div>
  )
}

/* ─── Portal call-to-action ─── */

function DropPortal() {
  const card = useRef<HTMLButtonElement>(null)
  const primary = useRef<HTMLButtonElement>(null)
  useTilt(card)
  useMagnetic(primary, 0.25)

  return (
    <section
      id="open"
      className="relative flex h-full min-h-[640px] flex-col items-center justify-center px-5 pt-20 pb-16"
    >
      <p className="flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
        <span className="size-2 rounded-full bg-primary" /> Your turn
      </p>
      <h2 className="mt-4 text-center font-display text-[clamp(2.6rem,7vw,5.5rem)] leading-[0.98] font-light tracking-tight">
        Now see <em className="text-iridescent font-normal">your own.</em>
      </h2>
      <p className="mt-4 max-w-lg text-center text-[15px] text-pretty text-muted-foreground">
        Drop a HAR file into the portal. It is parsed in a Web Worker on your machine and never uploaded.
      </p>

      <button
        ref={card}
        type="button"
        data-cursor="Open"
        onClick={() => void openFromPicker()}
        className="group relative mt-10 flex w-full max-w-xl flex-col items-center gap-5 overflow-hidden rounded-[2rem] border border-white/50 px-8 py-14 shadow-[var(--shadow-lift)] glass outline-none focus-visible:ring-4 focus-visible:ring-ring/25 dark:border-white/10"
        style={{ transformStyle: 'preserve-3d' }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background:
              'radial-gradient(500px circle at var(--sheen-x, 50%) var(--sheen-y, 50%), color-mix(in oklab, var(--lavender) 40%, transparent), transparent 55%)',
          }}
        />
        <span
          aria-hidden
          className="absolute inset-4 rounded-[1.5rem] border-2 border-dashed border-primary/25 transition-colors group-hover:border-primary/50"
        />
        <span
          className="relative grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-lavender via-peach to-sage shadow-[var(--shadow-soft)] transition-transform duration-500 group-hover:-translate-y-1 group-hover:rotate-6"
          style={{ transform: 'translateZ(40px)' }}
        >
          <FileUp className="size-7 text-white drop-shadow" />
        </span>
        <span
          className="relative flex flex-col items-center gap-1.5"
          style={{ transform: 'translateZ(24px)' }}
        >
          <span className="text-lg font-medium">
            Drop a HAR file, or{' '}
            <span className="text-primary underline decoration-primary/30 underline-offset-4">browse</span>
          </span>
          <span className="text-xs text-muted-foreground">
            .har or .json of any size · drop several to merge them
          </span>
        </span>
        <span className="relative" style={{ transform: 'translateZ(16px)' }}>
          <KbdCombo keys={[MOD, 'O']} />
        </span>
      </button>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          ref={primary}
          type="button"
          data-cursor="Try it"
          onClick={() => void openSample()}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground shadow-[var(--shadow-soft)] outline-none hover:shadow-[var(--shadow-lift)] focus-visible:ring-4 focus-visible:ring-ring/30 active:scale-95"
        >
          <FlaskConical className="size-4" /> Explore a sample capture
        </button>
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-panel/70 px-3 py-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5 text-success" /> 100% local
        </span>
      </div>
    </section>
  )
}

/* ─── Features bento ─── */

const FEATURES: ReadonlyArray<{
  icon: LucideIcon
  title: string
  text: string
  tint: string
  fresh?: boolean
  wide?: boolean
}> = [
  {
    icon: Search,
    title: 'Search everything',
    text: 'Facets for status, method, type and domain. Regex and inverted search over URLs, headers and bodies.',
    tint: 'from-lavender/50',
    wide: true,
  },
  {
    icon: Orbit,
    title: 'Galaxy',
    text: 'Your capture as a 3D solar system: domains are planets, requests are moons. Replay it in time order.',
    tint: 'from-sky/50',
    fresh: true,
  },
  {
    icon: ShieldCheck,
    title: 'Security grade',
    text: 'Security headers, cookie flags, secrets in URLs and CORS misconfigurations, scored from A to F.',
    tint: 'from-sage/50',
    fresh: true,
  },
  {
    icon: Route,
    title: 'Endpoints',
    text: 'API calls grouped by route (/users/:id) with p50 and p95 latency and error rates.',
    tint: 'from-peach/50',
    fresh: true,
  },
  {
    icon: Gauge,
    title: 'Health score',
    text: 'One number for TTFB, reliability, weight and compression, with tips ordered by impact.',
    tint: 'from-butter/60',
    fresh: true,
  },
  {
    icon: ChartGantt,
    title: 'Waterfall & timeline',
    text: 'Every phase of every request, plus how many run at once on each domain.',
    tint: 'from-blush/50',
    wide: true,
  },
  {
    icon: TriangleAlert,
    title: 'Issues',
    text: 'Failures, slow TTFB, redirect chains, oversized images, missing caching and duplicate requests.',
    tint: 'from-peach/50',
  },
  {
    icon: GitCompareArrows,
    title: 'Compare & diff',
    text: 'Load a second capture to see what got faster, slower, added or removed.',
    tint: 'from-lavender/50',
  },
  {
    icon: Download,
    title: 'Share safely',
    text: 'Sanitized HAR, cURL, fetch, Postman, CSV, with secrets redacted.',
    tint: 'from-sage/50',
  },
]

function FeatureCard({ f, i }: { f: (typeof FEATURES)[number]; i: number }) {
  return (
    <li
      className={cn(
        'group spotlight relative card-lift overflow-hidden rounded-3xl border bg-panel/80 p-6 backdrop-blur',
        f.wide && 'sm:col-span-2',
      )}
      style={{ animationDelay: `${i * 60}ms` }}
      data-cursor="hover"
    >
      <div
        className={cn(
          'pointer-events-none absolute -top-16 -right-16 size-44 rounded-full bg-gradient-to-br to-transparent blur-2xl transition-transform duration-700 group-hover:scale-125',
          f.tint,
        )}
      />
      <div className="relative flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-2xl border bg-background/70 transition-transform duration-500 group-hover:-rotate-6">
          <f.icon className="size-5 text-primary" />
        </span>
        {f.fresh && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
            <Sparkles className="size-3" /> New
          </span>
        )}
      </div>
      <h3 className="relative mt-5 font-display text-xl font-medium tracking-tight">{f.title}</h3>
      <p className="relative mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{f.text}</p>
    </li>
  )
}

function Section({
  id,
  kicker,
  title,
  children,
}: {
  id: string
  kicker: string
  title: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} className="mx-auto w-full max-w-6xl px-5 py-24">
      <p className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">{kicker}</p>
      <h2 className="mt-3 max-w-2xl font-display text-[clamp(2rem,4.5vw,3.4rem)] leading-[1.02] font-light tracking-tight text-balance">
        {title}
      </h2>
      <div className="mt-10">{children}</div>
    </section>
  )
}

/* ─── The page ─── */

export function Landing({ onFallback }: { onFallback: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<StoryScene | null>(null)
  const fills = useRef<Array<HTMLSpanElement | null>>([])
  const film = useRef({ time: 0, playing: true })
  const logoClicks = useRef<number[]>([])
  const [ready, setReady] = useState(false)
  const [intro, setIntro] = useState<IntroPhase>('loading')
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [ended, setEnded] = useState(false)
  const theme = useResolvedTheme()
  // Read once at boot; later theme changes go through setDark below.
  const initialDark = useRef(theme === 'dark')

  // Boot the scene once; theme changes are pushed separately so the GPU state survives.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let scene: StoryScene
    let disposed = false
    try {
      scene = new StoryScene({
        canvas,
        dark: initialDark.current,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        onIntro: (phase) => setIntro(phase),
      })
    } catch (error) {
      console.warn('WebGL unavailable, falling back to the classic welcome screen', error)
      onFallback()
      return
    }
    sceneRef.current = scene
    const resize = () => scene.resize(innerWidth, innerHeight)
    resize()
    addEventListener('resize', resize)

    const fonts = Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))])
    void fonts.then(() => {
      if (disposed) return
      scene.build()
      scene.start()
      setReady(true)
    })
    return () => {
      disposed = true
      removeEventListener('resize', resize)
      scene.dispose()
      sceneRef.current = null
    }
  }, [onFallback])

  useEffect(() => sceneRef.current?.setDark(theme === 'dark'), [theme])

  // The film clock: advances on its own once the intro has played, drives the camera and the bar.
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let shown = -1
    let finished = false
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const scene = sceneRef.current
      const f = film.current
      if (scene?.introDone && f.playing) f.time = Math.min(FILM_SECONDS, f.time + dt)
      const at = filmAt(f.time)
      scene?.setProgress(at.p)
      for (const [n, step] of STEPS.entries()) {
        const el = fills.current[n]
        if (!el) continue
        const k = at.index > step.index ? 1 : at.index === step.index ? at.local : 0
        el.style.transform = `scaleX(${k})`
      }
      if (at.index !== shown) {
        shown = at.index
        setIndex(at.index)
      }
      const done = f.time >= FILM_SECONDS
      if (done !== finished) {
        finished = done
        setEnded(done)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const setPlay = (value: boolean) => {
    film.current.playing = value
    setPlaying(value)
  }

  const seek = (act: number) => {
    film.current.time = ACT_STARTS[act]!
    sceneRef.current?.skipIntro()
    setIntro('done')
    setPlay(true)
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const skipFilm = () => {
    sceneRef.current?.skipIntro()
    setIntro('done')
    film.current.time = FILM_SECONDS
  }

  const replay = () => seek(0)

  // Space pauses, Escape skips to the end, like a video player.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (film.current.time >= FILM_SECONDS) return
      if ((e.target as Element | null)?.closest('input, textarea, button, a')) return
      if (e.key === ' ') {
        e.preventDefault()
        film.current.playing = !film.current.playing
        setPlaying(film.current.playing)
      } else if (e.key === 'Escape') {
        sceneRef.current?.skipIntro()
        setIntro('done')
        film.current.time = FILM_SECONDS
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  const onPointerMove = (e: React.PointerEvent) => {
    sceneRef.current?.setPointer((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  }

  const onClick = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('a, button, input, label, [data-no-burst]')) return
    sceneRef.current?.burst((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  }

  const unlockStorm = useCallback(() => {
    sceneRef.current?.storm()
    toast('Packet storm unlocked', { description: 'Konami code accepted. Every packet obeys gravity now.' })
  }, [])
  useKonamiCode(unlockStorm)

  const onLogo = () => {
    const now = performance.now()
    logoClicks.current = [...logoClicks.current.filter((t) => now - t < 1600), now]
    if (logoClicks.current.length >= 5) {
      logoClicks.current = []
      sceneRef.current?.storm()
      toast('You found the secret door', { description: 'Five clicks on the logo. Try ↑↑↓↓←→←→BA too.' })
    }
  }

  const act = ACTS[index]!
  const outro = ended || act.id === 'portal'
  const titleIn = intro === 'title' || intro === 'done'

  return (
    <div
      className="relative h-full overflow-hidden bg-background"
      data-custom-cursor
      onPointerMove={onPointerMove}
    >
      <canvas ref={canvasRef} className="fixed inset-0 size-full" aria-hidden />
      {/* Soft vignette keeps the 3D calm and paper-like; heavier at the bottom so captions read. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10"
        style={{
          background:
            'radial-gradient(ellipse at 50% 38%, transparent 50%, color-mix(in oklab, var(--background) 65%, transparent) 100%), linear-gradient(to top, color-mix(in oklab, var(--background) 72%, transparent), transparent 42%)',
        }}
      />

      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between px-5 md:px-8">
        <button
          type="button"
          onClick={onLogo}
          data-cursor="hover"
          className="flex items-center gap-2.5 rounded-full outline-none"
        >
          <LogoMark className="size-8 transition-transform duration-500 hover:rotate-12" />
          <span className="flex flex-col items-start leading-none">
            <span className="text-[13px] font-semibold">HAR Viewer</span>
            <span className="font-display text-xs text-muted-foreground italic">Lumen</span>
          </span>
        </button>
        <div className="flex items-center gap-1.5">
          {ended ? (
            <button
              type="button"
              onClick={replay}
              className="inline-flex items-center gap-1.5 rounded-full border bg-panel/70 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur hover:text-foreground"
            >
              <RotateCcw className="size-3.5" /> Replay story
            </button>
          ) : (
            ready && (
              <button
                type="button"
                onClick={skipFilm}
                className="inline-flex items-center gap-1.5 rounded-full border bg-panel/70 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur hover:text-foreground"
              >
                Skip to app <FastForward className="size-3.5" />
              </button>
            )
          )}
          <ThemeMenu />
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <GithubIcon className="size-4" />
          </a>
        </div>
      </header>

      {/* Lower third: caption + timing bar, one consistent, centred column. */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-5 transition-all duration-700 sm:pb-7',
          outro ? 'pointer-events-none translate-y-6 opacity-0' : 'opacity-100',
        )}
      >
        <div className="flex w-full max-w-4xl flex-col items-center gap-5">
          <div className="pointer-events-none min-h-[9.5rem] w-full content-end" aria-live="polite">
            {index === 0 ? <OpeningTitle visible={titleIn} /> : <Caption key={act.id} act={act} />}
          </div>
          <div
            className={cn(
              'w-full transition-all delay-300 duration-700',
              intro === 'done' ? 'opacity-100' : 'translate-y-4 opacity-0',
            )}
          >
            <FilmBar
              index={index}
              playing={playing}
              fills={fills}
              onToggle={() => setPlay(!playing)}
              onSeek={seek}
              onSkip={skipFilm}
            />
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        onClick={onClick}
        className={cn(
          'absolute inset-0 z-[15] overflow-x-hidden',
          ended ? 'overflow-y-auto' : 'overflow-y-hidden',
        )}
      >
        <div
          className={cn(
            'h-full transition-[opacity,transform] duration-1000',
            outro ? 'opacity-100' : 'pointer-events-none translate-y-6 opacity-0',
          )}
        >
          <DropPortal />
        </div>
        {ended && (
          <>
            <button
              type="button"
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              className="absolute bottom-5 left-1/2 flex -translate-x-1/2 animate-float flex-col items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              What else can it do?
              <ChevronDown className="size-4" />
            </button>
            <div className="relative bg-gradient-to-b from-transparent via-background/85 to-background backdrop-blur-[2px]">
              <Section
                id="features"
                kicker="What you can do"
                title={
                  <>
                    Everything DevTools shows, and <em className="text-iridescent">more.</em>
                  </>
                }
              >
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {FEATURES.map((f, i) => (
                    <FeatureCard key={f.title} f={f} i={i} />
                  ))}
                </ul>
              </Section>
              <Section id="guide" kicker="Getting a HAR file" title="Capture one in under a minute.">
                <div className="rounded-3xl border p-2 shadow-[var(--shadow-soft)] glass sm:p-4">
                  <CaptureGuide className="w-full" />
                </div>
              </Section>
              <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 pt-6 pb-12 text-xs text-muted-foreground">
                <span className="flex items-center gap-2">
                  <LogoMark className="size-5" /> HAR Viewer · Lumen. Private, offline, open source.
                </span>
                <span className="font-mono">psst: ↑↑↓↓←→←→BA</span>
              </footer>
            </div>
          </>
        )}
      </div>

      <Preloader ready={ready} gone={ready && intro !== 'loading'} />
      <Cursor />
    </div>
  )
}
