import {
  ChartGantt,
  Download,
  FileUp,
  FlaskConical,
  Lock,
  Orbit,
  Route,
  Search,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { GithubIcon, LogoMark, REPO_URL } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { KbdCombo } from '@/components/ui/kbd'
import { useSpotlight } from '@/hooks/use-spotlight'
import { cn } from '@/lib/cn'
import { MOD } from '@/lib/platform'
import { openSample } from '@/services/capture'
import { openFromPicker } from '../command/commands'
import { ThemeMenu } from '../shell/theme-menu'
import { CaptureGuide } from './capture-guide'

const FEATURES = [
  {
    icon: Search,
    title: 'Search everything',
    text: 'Filter by status, method, type or domain; search URLs, headers and bodies with regex.',
    tint: 'bg-sky/40',
  },
  {
    icon: ChartGantt,
    title: 'See where time goes',
    text: 'Waterfall, per-domain timeline and a phase-by-phase timing breakdown.',
    tint: 'bg-butter/50',
  },
  {
    icon: Orbit,
    title: 'Network galaxy',
    text: 'Fly through a 3D map of every domain and request in the capture.',
    tint: 'bg-lavender/45',
  },
  {
    icon: Route,
    title: 'Endpoint map',
    text: 'API calls grouped by route, with p50/p95 latency and error rates.',
    tint: 'bg-sage/45',
  },
  {
    icon: ShieldCheck,
    title: 'Security grade',
    text: 'Headers, cookie flags and leaked secrets, graded from A to F.',
    tint: 'bg-blush/45',
  },
  {
    icon: TriangleAlert,
    title: 'Find problems fast',
    text: 'Automatic checks for failures, slow TTFB, redirects, missing caching and more.',
    tint: 'bg-peach/45',
  },
  {
    icon: Download,
    title: 'Share safely',
    text: 'Export as sanitized HAR, cURL, fetch, Postman or CSV, with secrets redacted.',
    tint: 'bg-sky/40',
  },
]

/** Calm static welcome, used when WebGL (and so the 3D story) is unavailable. */
export function WelcomeScreen() {
  useSpotlight()
  return (
    <div className="relative h-full overflow-y-auto">
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-24 size-[520px] animate-aurora rounded-full bg-(--aurora-1) blur-3xl" />
        <div className="absolute top-1/3 -right-32 size-[480px] animate-aurora rounded-full bg-(--aurora-2) blur-3xl [animation-delay:-6s]" />
        <div className="absolute -bottom-40 left-1/4 size-[560px] animate-aurora rounded-full bg-(--aurora-3) blur-3xl [animation-delay:-12s]" />
      </div>

      <header className="sticky top-0 z-10 flex h-14 items-center justify-between px-5 glass">
        <div className="flex items-center gap-2">
          <LogoMark className="size-7" />
          <span className="font-display text-[15px] font-semibold tracking-tight">HAR Viewer</span>
          <span className="text-iridescent text-2xs font-semibold tracking-[0.18em] uppercase">Lumen</span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeMenu />
          <Button variant="ghost" size="icon-sm" asChild>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="GitHub repository">
              <GithubIcon />
            </a>
          </Button>
        </div>
      </header>

      <main className="relative mx-auto flex w-full max-w-4xl flex-col items-center px-5 pt-[8vh] pb-20">
        <span className="inline-flex animate-rise items-center gap-1.5 rounded-full border bg-panel/70 px-3 py-1 text-xs text-muted-foreground shadow-xs backdrop-blur">
          <Lock className="size-3.5 text-success" /> Runs entirely in your browser. Files are never uploaded.
        </span>
        <h1 className="mt-6 animate-rise text-center font-display text-4xl font-semibold tracking-tight text-balance [animation-delay:80ms] sm:text-6xl">
          Every request, <span className="text-iridescent">beautifully</span> laid bare
        </h1>
        <p className="mt-4 max-w-xl animate-rise text-center text-[15px] text-pretty text-muted-foreground [animation-delay:160ms]">
          Open a HAR file to search every request, read headers and bodies, spot slow or failing calls, grade
          security and diff captures, all offline.
        </p>

        <button
          type="button"
          onClick={() => void openFromPicker()}
          className="group spotlight relative mt-10 flex w-full max-w-2xl animate-rise cursor-default flex-col items-center gap-4 overflow-hidden rounded-[28px] border-2 border-dashed border-border-strong bg-panel/80 px-6 py-14 shadow-[var(--shadow-soft)] backdrop-blur-md transition-[border-color,box-shadow,transform] duration-500 outline-none [animation-delay:240ms] hover:-translate-y-1 hover:border-primary/50 hover:shadow-[var(--shadow-lift)] focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/15"
        >
          <span className="relative grid size-16 place-items-center">
            <span className="absolute inset-0 animate-breathe rounded-2xl bg-[linear-gradient(135deg,var(--color-lavender),var(--color-peach))] opacity-60 blur-md" />
            <span className="relative grid size-14 place-items-center rounded-2xl border bg-panel shadow-sm transition-transform duration-500 group-hover:-translate-y-1 group-hover:rotate-[-4deg]">
              <FileUp className="size-6 text-primary" />
            </span>
          </span>
          <span className="flex flex-col items-center gap-1">
            <span className="text-[15px] font-medium">
              Drop a HAR file here, or <span className="text-primary">browse</span>
            </span>
            <span className="text-xs text-muted-foreground">
              .har or .json of any size · drop several to merge them
            </span>
          </span>
          <KbdCombo keys={[MOD, 'O']} />
        </button>

        <div className="mt-5 flex animate-rise items-center gap-3 text-xs text-muted-foreground [animation-delay:320ms]">
          <span>No file handy?</span>
          <Button
            variant="primary"
            size="sm"
            className="rounded-full px-3.5"
            onClick={() => void openSample()}
          >
            <FlaskConical /> Explore a sample capture
          </Button>
        </div>

        <ul className="mt-16 grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <li
              key={f.title}
              className="spotlight flex card-lift animate-rise gap-3 rounded-2xl border bg-panel/75 p-4 backdrop-blur"
              style={{ animationDelay: `${380 + i * 60}ms` }}
            >
              <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', f.tint)}>
                <f.icon className="size-4 text-foreground/80" />
              </span>
              <span>
                <span className="block text-[13px] font-semibold">{f.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{f.text}</span>
              </span>
            </li>
          ))}
        </ul>

        <CaptureGuide className="mt-12 w-full" />
      </main>
    </div>
  )
}
