import { Crosshair, Orbit, Pause, Play, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { LegendSwatch } from '@/components/charts'
import { MethodLabel, StatusCode } from '@/components/http-labels'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SegmentedControl, SegmentedItem } from '@/components/ui/tabs'
import { useResolvedTheme } from '@/hooks/use-theme'
import { cn } from '@/lib/cn'
import { formatBytes, formatDuration, formatNumber, pluralize } from '@/lib/format'
import { useAppStore } from '@/store'
import { selectEntryMap, useVisibleEntries } from '@/store/selectors'
import { buildGalaxy, type GalaxyModel } from './galaxy-model'
import { GalaxyScene, readPalette, type ReplayState } from './galaxy-scene'

const SPEEDS = [1, 4, 16] as const

const STATUS_LEGEND = [
  { label: '2xx', swatch: 'bg-sage' },
  { label: '3xx', swatch: 'bg-sky' },
  { label: '4xx', swatch: 'bg-peach' },
  { label: '5xx / failed', swatch: 'bg-chart-critical' },
]

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

interface Hover {
  id: number
  x: number
  y: number
}

function HoverCard({ hover }: { hover: Hover }) {
  const entry = useAppStore((s) => selectEntryMap(s).get(hover.id))
  if (!entry) return null
  return (
    <div
      className="pointer-events-none absolute z-20 w-72 animate-in rounded-xl border p-3 shadow-overlay glass fade-in-0 zoom-in-95"
      style={{ left: hover.x + 16, top: hover.y + 16 }}
    >
      <div className="flex items-center gap-2">
        <MethodLabel method={entry.method} />
        <StatusCode status={entry.status} statusText={entry.statusText} />
      </div>
      <p className="mt-1.5 line-clamp-2 font-mono text-xs break-all">
        <span className="text-subtle-foreground">{entry.host}</span>
        {entry.path}
      </p>
      <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground tabular">{formatDuration(entry.time)}</span> time
        </span>
        <span>
          <span className="font-medium text-foreground tabular">{formatBytes(entry.size)}</span> size
        </span>
        <span className="ml-auto">{entry.type}</span>
      </div>
      <p className="mt-2 text-2xs text-subtle-foreground">Click to inspect</p>
    </div>
  )
}

function DomainPanel({
  model,
  focus,
  onFocus,
}: {
  model: GalaxyModel
  focus: number | null
  onFocus: (index: number | null) => void
}) {
  const item = (index: number | null, label: string, count: number, swatch: string, errors = 0) => (
    <li key={index ?? 'all'}>
      <button
        type="button"
        onClick={() => onFocus(index)}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors outline-none hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/40',
          focus === index && 'bg-selection-strong text-foreground',
        )}
      >
        <LegendSwatch className={cn('size-2.5 rounded-full', swatch)} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {errors > 0 && <span className="text-danger tabular">{errors}!</span>}
        <span className="text-subtle-foreground tabular">{formatNumber(count)}</span>
      </button>
    </li>
  )

  return (
    <div className="flex max-h-full min-h-0 w-64 flex-col rounded-2xl border shadow-soft glass">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Crosshair className="size-3.5 text-subtle-foreground" />
        <span className="text-xs font-semibold">Focus</span>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {item(null, 'Whole system', model.moons.length, 'bg-primary/40')}
        {item(-1, model.sun.host || 'page', model.sun.count, 'bg-butter')}
        {model.planets.map((p, i) =>
          item(
            i,
            p.label,
            p.count,
            p.kind === 'first' ? 'bg-primary' : p.kind === 'third' ? 'bg-lavender' : 'bg-chart-neutral',
            p.errors,
          ),
        )}
      </ul>
    </div>
  )
}

function ReplayBar({
  duration,
  replay,
  onChange,
}: {
  duration: number
  replay: ReplayState
  onChange: (next: ReplayState) => void
}) {
  const active = replay.time !== null
  const time = replay.time ?? 0
  const finished = active && !replay.playing && time >= duration

  const toggle = () => {
    if (!active || finished) onChange({ ...replay, time: 0, playing: true })
    else onChange({ ...replay, playing: !replay.playing })
  }

  return (
    <div className="flex w-full max-w-xl items-center gap-3 rounded-2xl border px-3 py-2 shadow-soft glass">
      <Button
        variant={active ? 'secondary' : 'primary'}
        size="sm"
        onClick={toggle}
        aria-label={replay.playing ? 'Pause replay' : 'Play replay'}
      >
        {replay.playing ? <Pause /> : <Play />}
        {active ? (replay.playing ? 'Pause' : finished ? 'Again' : 'Resume') : 'Replay'}
      </Button>
      <input
        type="range"
        min={0}
        max={Math.max(1, duration)}
        step={Math.max(1, duration / 500)}
        value={Math.min(time, duration)}
        onChange={(e) => onChange({ ...replay, time: Number(e.target.value), playing: false })}
        className="h-1.5 min-w-0 flex-1 cursor-pointer accent-primary"
        aria-label="Replay position"
      />
      <span className="w-16 text-right font-mono text-xs text-muted-foreground tabular">
        {active ? formatDuration(time) : formatDuration(duration)}
      </span>
      <SegmentedControl
        type="single"
        value={String(replay.speed)}
        onValueChange={(v) => v && onChange({ ...replay, speed: Number(v) })}
        aria-label="Replay speed"
      >
        {SPEEDS.map((s) => (
          <SegmentedItem key={s} value={String(s)}>
            {s}×
          </SegmentedItem>
        ))}
      </SegmentedControl>
      {active && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onChange({ ...replay, time: null, playing: false })}
          aria-label="Exit replay"
        >
          <RotateCcw />
        </Button>
      )}
    </div>
  )
}

function GalaxyCanvas({ model }: { model: GalaxyModel }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<GalaxyScene | null>(null)
  const theme = useResolvedTheme()
  const selectedId = useAppStore((s) => s.selectedId)
  const [hover, setHover] = useState<Hover | null>(null)
  const [focus, setFocus] = useState<number | null>(null)
  const [replay, setReplay] = useState<ReplayState>({ time: null, playing: false, speed: 4 })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new GalaxyScene(
      host,
      {
        onHover: (id, x, y) =>
          setHover((prev) =>
            id === null
              ? null
              : prev?.id === id && Math.abs(prev.x - x) + Math.abs(prev.y - y) < 2
                ? prev
                : { id, x, y },
          ),
        onPick: (id) => useAppStore.getState().inspect(id),
        onReplayTick: (time, playing) => setReplay((r) => ({ ...r, time, playing })),
      },
      readPalette(),
    )
    sceneRef.current = scene
    return () => {
      scene.dispose()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    sceneRef.current?.setModel(model)
  }, [model])

  useEffect(() => {
    // The theme attribute is applied by an ancestor effect; read tokens once it has landed.
    const frame = requestAnimationFrame(() => sceneRef.current?.setPalette(readPalette()))
    return () => cancelAnimationFrame(frame)
  }, [theme])

  useEffect(() => sceneRef.current?.setSelected(selectedId), [selectedId])
  // A filter change can remove the focused planet; fall back to the whole system.
  const activeFocus = focus !== null && focus >= model.planets.length ? null : focus
  useEffect(() => sceneRef.current?.setFocus(activeFocus), [activeFocus])

  const changeReplay = (next: ReplayState) => {
    setReplay(next)
    sceneRef.current?.setReplay(next)
  }

  const firstParty = model.planets.filter((p) => p.kind === 'first').length
  const thirdParty = model.planets.filter((p) => p.kind === 'third').length

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <div ref={hostRef} className="absolute inset-0" />

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-3 p-4">
        <div className="flex min-h-0 flex-1 items-start justify-between gap-3">
          <div className="pointer-events-auto flex w-72 flex-col gap-3 rounded-2xl border p-4 shadow-soft glass">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-primary/15 text-primary">
                <Orbit className="size-4" />
              </span>
              <div className="min-w-0">
                <h1 className="font-display text-base leading-tight font-semibold tracking-tight">Galaxy</h1>
                <p className="truncate text-xs text-muted-foreground">
                  {pluralize(model.moons.length, 'request')} · {pluralize(model.planets.length + 1, 'host')}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <LegendSwatch className="size-2.5 rounded-full bg-butter" /> Page host (the sun)
              </span>
              <span className="flex items-center gap-2">
                <LegendSwatch className="size-2.5 rounded-full bg-primary" /> First-party ({firstParty})
              </span>
              <span className="flex items-center gap-2">
                <LegendSwatch className="size-2.5 rounded-full bg-lavender" /> Third-party ({thirdParty})
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 border-t pt-2.5 text-xs text-muted-foreground">
              {STATUS_LEGEND.map((s) => (
                <span key={s.label} className="inline-flex items-center gap-1.5">
                  <LegendSwatch className={cn('rounded-full', s.swatch)} />
                  {s.label}
                </span>
              ))}
            </div>
            <p className="text-2xs leading-relaxed text-subtle-foreground">
              Orbits are ordered by when each host was first contacted; planet size is bytes transferred.
              {model.truncated && ' Showing the first 12,000 requests.'}
            </p>
          </div>

          <div className="pointer-events-auto hidden max-h-full min-h-0 md:flex">
            <DomainPanel model={model} focus={activeFocus} onFocus={setFocus} />
          </div>
        </div>

        <div className="pointer-events-auto flex flex-col items-center gap-2">
          <ReplayBar duration={model.duration} replay={replay} onChange={changeReplay} />
          <p className="flex items-center gap-1.5 text-2xs text-subtle-foreground">
            <Sparkles className="size-3" /> Drag to orbit · scroll to zoom · right-drag to pan · click a moon
            to inspect it
          </p>
        </div>
      </div>

      {hover && <HoverCard hover={hover} />}
    </div>
  )
}

export function GalaxyView() {
  const entries = useVisibleEntries()
  const model = buildGalaxy(entries)
  const [supported] = useState(hasWebGL)

  return (
    <div
      className="h-full min-h-0"
      style={{
        background:
          'radial-gradient(ellipse at 50% 45%, color-mix(in oklab, var(--butter) 22%, transparent), transparent 55%), radial-gradient(ellipse at 15% 10%, color-mix(in oklab, var(--lavender) 30%, transparent), transparent 50%), radial-gradient(ellipse at 90% 90%, color-mix(in oklab, var(--peach) 26%, transparent), transparent 50%), var(--background)',
      }}
    >
      {!supported ? (
        <EmptyState
          icon={<Orbit />}
          title="3D isn't available here"
          description="Your browser or GPU doesn't support WebGL, which the Galaxy view needs."
          className="h-full"
        />
      ) : !entries.length ? (
        <EmptyState
          icon={<Orbit />}
          title="An empty sky"
          description="No requests match the current filters. Clear a filter to bring the planets back."
          className="h-full"
        />
      ) : (
        <GalaxyCanvas model={model} />
      )}
    </div>
  )
}
