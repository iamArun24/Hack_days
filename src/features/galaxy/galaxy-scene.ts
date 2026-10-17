import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { StatusGroup } from '@/har/types'
import type { GalaxyModel, PlanetKind } from './galaxy-model'

/* ─── Palette (read from the CSS design tokens so the map follows the theme) ─── */

export interface GalaxyPalette {
  status: Record<StatusGroup, THREE.Color>
  planet: Record<PlanetKind, THREE.Color>
  sun: THREE.Color
  orbit: THREE.Color
  ring: THREE.Color
  ink: string
  labelBg: string
  dark: boolean
}

/** Resolves any CSS color (including oklch tokens) to sRGB via a 1px canvas round-trip. */
function cssColor(ctx: CanvasRenderingContext2D, value: string, fallback: string): THREE.Color {
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = fallback
  ctx.fillStyle = value || fallback
  ctx.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace)
}

export function readPalette(): GalaxyPalette {
  const style = getComputedStyle(document.documentElement)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const token = (name: string, fallback: string) =>
    cssColor(ctx, style.getPropertyValue(name).trim(), fallback)
  const dark = document.documentElement.dataset.theme === 'dark'
  const sage = token('--sage', '#a8d4bd')
  const sky = token('--sky', '#a9cce3')
  const peach = token('--peach', '#f4c3ac')
  const blush = token('--chart-critical', '#e08a8a')
  const fg = token('--foreground', '#4a4366')
  return {
    status: { '1xx': sky, '2xx': sage, '3xx': sky, '4xx': peach, '5xx': blush, failed: blush },
    planet: {
      first: token('--primary', '#9b8de0'),
      third: token('--lavender', '#b9b2e8'),
      others: token('--chart-neutral', '#c9c5d3'),
    },
    sun: token('--butter', '#f2df9e'),
    orbit: token('--border-strong', '#d8d0c8'),
    ring: token('--primary', '#9b8de0'),
    ink: `#${fg.getHexString(THREE.SRGBColorSpace)}`,
    labelBg: dark ? 'rgba(52,50,92,0.82)' : 'rgba(255,253,250,0.86)',
    dark,
  }
}

/* ─── Small textures ─── */

function glowTexture(): THREE.Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.3, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function labelSprite(text: string, palette: GalaxyPalette, height: number): THREE.Sprite {
  const scale = 2
  const font = `600 ${26 * scale}px 'Geist Variable', ui-sans-serif, sans-serif`
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = font
  const pad = 20 * scale
  const w = Math.ceil(measure.measureText(text).width + pad * 2)
  const h = 54 * scale
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.beginPath()
  ctx.roundRect(2, 2, w - 4, h - 4, (h - 4) / 2)
  ctx.fillStyle = palette.labelBg
  ctx.fill()
  ctx.lineWidth = 2 * scale
  ctx.strokeStyle = 'rgba(160,150,200,0.3)'
  ctx.stroke()
  ctx.font = font
  ctx.fillStyle = palette.ink
  ctx.textBaseline = 'middle'
  ctx.fillText(text, pad, h / 2 + scale)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }),
  )
  sprite.scale.set((height * w) / h, height, 1)
  sprite.renderOrder = 20
  return sprite
}

/* ─── Scene ─── */

export interface ReplayState {
  /** Capture time being shown, in ms from the first request. Null when replay is off. */
  time: number | null
  playing: boolean
  speed: number
}

export interface GalaxyCallbacks {
  onHover: (entryId: number | null, x: number, y: number) => void
  onPick: (entryId: number) => void
  onReplayTick: (time: number, playing: boolean) => void
}

const TRAIL_SEGMENTS = 14
const MAX_FLIGHTS = 320
/** Shortest on-screen flight, in real seconds, so 20 ms requests are still visible. */
const MIN_FLIGHT_SECONDS = 0.45

interface PlanetNode {
  group: THREE.Group
  body: THREE.Mesh
  glow: THREE.Sprite
  label: THREE.Sprite
  orbit: THREE.LineLoop
}

export class GalaxyScene {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 800)
  private readonly controls: OrbitControls
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2(-10, -10)
  private readonly clientPointer = { x: 0, y: 0 }
  private pointerDirty = false
  private readonly clock = new THREE.Clock()
  private readonly glowTex = glowTexture()
  private readonly callbacks: GalaxyCallbacks
  private readonly container: HTMLElement
  private readonly resizeObserver: ResizeObserver
  private readonly reducedMotion: boolean
  private frame = 0
  private elapsed = 0

  private model: GalaxyModel | null = null
  private palette: GalaxyPalette
  private readonly world = new THREE.Group()
  private sun: THREE.Mesh | null = null
  private sunGlow: THREE.Sprite | null = null
  private sunLabel: THREE.Sprite | null = null
  private planets: PlanetNode[] = []
  private moons: THREE.InstancedMesh | null = null
  private readonly moonGeometry = new THREE.SphereGeometry(1, 14, 10)
  private readonly moonMaterial = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 })
  private readonly selectionRing: THREE.Mesh
  private readonly hoverRing: THREE.Mesh
  private readonly trails: THREE.LineSegments
  private readonly trailPositions: Float32Array
  private readonly trailColors: Float32Array
  private readonly planetPositions: THREE.Vector3[] = []
  private readonly moonPositions: THREE.Vector3[] = []
  private moonIndex = new Map<number, number>()

  private selectedId: number | null = null
  private hoveredIndex = -1
  private focus: number | null = null
  private focusDistance = 0
  private replay: ReplayState = { time: null, playing: false, speed: 1 }
  private lastTick = 0
  private downAt = { x: 0, y: 0 }

  private readonly tmpMatrix = new THREE.Matrix4()
  private readonly tmpQuat = new THREE.Quaternion()
  private readonly tmpScale = new THREE.Vector3()
  private readonly tmpVec = new THREE.Vector3()
  private readonly tmpVec2 = new THREE.Vector3()
  private readonly tmpColor = new THREE.Color()
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0)

  constructor(container: HTMLElement, callbacks: GalaxyCallbacks, palette: GalaxyPalette) {
    this.container = container
    this.callbacks = callbacks
    this.palette = palette
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.touchAction = 'none'
    container.appendChild(this.renderer.domElement)

    this.camera.position.set(0, 26, 46)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.minDistance = 4
    this.controls.maxDistance = 220
    this.controls.autoRotate = !this.reducedMotion
    this.controls.autoRotateSpeed = 0.35
    this.controls.enablePan = true
    this.controls.addEventListener('start', () => {
      this.controls.autoRotate = false
    })

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xf2d8cc, 1.6))
    const key = new THREE.DirectionalLight(0xffffff, 1.4)
    key.position.set(20, 40, 25)
    this.scene.add(key)
    const sunLight = new THREE.PointLight(0xffe7b0, 260, 140, 1.6)
    this.scene.add(sunLight)
    this.scene.add(this.world)

    const ringMaterial = (opacity: number) =>
      new THREE.MeshBasicMaterial({
        color: palette.ring,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    this.selectionRing = new THREE.Mesh(new THREE.RingGeometry(1.35, 1.75, 48), ringMaterial(0.95))
    this.selectionRing.visible = false
    this.selectionRing.renderOrder = 15
    this.hoverRing = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.5, 40), ringMaterial(0.55))
    this.hoverRing.visible = false
    this.scene.add(this.selectionRing, this.hoverRing)

    this.trailPositions = new Float32Array(MAX_FLIGHTS * TRAIL_SEGMENTS * 2 * 3)
    this.trailColors = new Float32Array(MAX_FLIGHTS * TRAIL_SEGMENTS * 2 * 4)
    const trailGeometry = new THREE.BufferGeometry()
    trailGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.trailPositions, 3).setUsage(THREE.DynamicDrawUsage),
    )
    trailGeometry.setAttribute(
      'color',
      new THREE.BufferAttribute(this.trailColors, 4).setUsage(THREE.DynamicDrawUsage),
    )
    trailGeometry.setDrawRange(0, 0)
    this.trails = new THREE.LineSegments(
      trailGeometry,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }),
    )
    this.trails.frustumCulled = false
    this.scene.add(this.trails)

    const el = this.renderer.domElement
    el.addEventListener('pointermove', this.handlePointerMove)
    el.addEventListener('pointerleave', this.handlePointerLeave)
    el.addEventListener('pointerdown', this.handlePointerDown)
    el.addEventListener('pointerup', this.handlePointerUp)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    this.frame = requestAnimationFrame(this.loop)
  }

  /* ─── Public API ─── */

  setModel(model: GalaxyModel): void {
    this.model = model
    this.rebuild()
  }

  setPalette(palette: GalaxyPalette): void {
    this.palette = palette
    ;(this.selectionRing.material as THREE.MeshBasicMaterial).color.copy(palette.ring)
    ;(this.hoverRing.material as THREE.MeshBasicMaterial).color.copy(palette.ring)
    this.rebuild()
  }

  setSelected(id: number | null): void {
    this.selectedId = id
  }

  /** Springs the camera to a planet (index), the sun (-1), or back to the whole system (null). */
  setFocus(index: number | null): void {
    this.focus = index
    this.controls.autoRotate = index === null && !this.reducedMotion
    if (index === null) this.focusDistance = 0
    else if (index === -1) this.focusDistance = 16
    else this.focusDistance = 7 + (this.model?.planets[index]?.size ?? 1) * 6
  }

  setReplay(state: ReplayState): void {
    this.replay = { ...state }
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    const el = this.renderer.domElement
    el.removeEventListener('pointermove', this.handlePointerMove)
    el.removeEventListener('pointerleave', this.handlePointerLeave)
    el.removeEventListener('pointerdown', this.handlePointerDown)
    el.removeEventListener('pointerup', this.handlePointerUp)
    this.controls.dispose()
    this.clearWorld()
    this.moonGeometry.dispose()
    this.moonMaterial.dispose()
    for (const ring of [this.selectionRing, this.hoverRing]) {
      ring.geometry.dispose()
      ;(ring.material as THREE.Material).dispose()
    }
    this.trails.geometry.dispose()
    ;(this.trails.material as THREE.Material).dispose()
    this.glowTex.dispose()
    this.renderer.dispose()
    el.remove()
  }

  /* ─── Building ─── */

  private clearWorld(): void {
    this.world.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineLoop) {
        if (obj.geometry !== this.moonGeometry) obj.geometry.dispose()
        const mat = obj.material as THREE.Material
        if (mat !== this.moonMaterial) mat.dispose()
      } else if (obj instanceof THREE.Sprite) {
        const mat = obj.material
        if (mat.map && mat.map !== this.glowTex) mat.map.dispose()
        mat.dispose()
      }
    })
    this.world.clear()
    if (this.moons) this.moons.dispose()
    this.moons = null
    this.planets = []
    this.sun = null
    this.sunGlow = null
    this.sunLabel = null
  }

  private glow(color: THREE.Color, size: number, opacity: number): THREE.Sprite {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: this.palette.dark ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    )
    sprite.scale.setScalar(size)
    return sprite
  }

  private rebuild(): void {
    this.clearWorld()
    const model = this.model
    if (!model || !model.moons.length) return
    const p = this.palette

    this.sun = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 48, 32),
      new THREE.MeshStandardMaterial({
        color: p.sun,
        emissive: p.sun,
        emissiveIntensity: 0.9,
        roughness: 0.6,
      }),
    )
    this.sunGlow = this.glow(p.sun, 9, p.dark ? 0.55 : 0.85)
    this.sunLabel = labelSprite(model.sun.host || 'page', p, 0.7)
    this.sunLabel.position.set(0, 2.5, 0)
    this.world.add(this.sun, this.sunGlow, this.sunLabel)

    this.planets = model.planets.map((planet) => {
      const color = p.planet[planet.kind]
      const group = new THREE.Group()
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(planet.size, 36, 24),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.18,
          roughness: 0.5,
          metalness: 0.05,
        }),
      )
      const glow = this.glow(color, planet.size * 4.2, p.dark ? 0.35 : 0.55)
      const label = labelSprite(planet.label, p, 0.5)
      label.position.set(0, planet.size + 0.75, 0)
      group.add(body, glow, label)

      const points: THREE.Vector3[] = []
      for (let i = 0; i < 128; i++) {
        const a = (i / 128) * Math.PI * 2
        points.push(
          new THREE.Vector3(
            Math.cos(a) * planet.orbitRadius,
            Math.sin(a) * planet.orbitRadius * planet.tilt,
            Math.sin(a) * planet.orbitRadius,
          ),
        )
      }
      const orbit = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: p.orbit,
          transparent: true,
          opacity: p.dark ? 0.35 : 0.7,
          depthWrite: false,
        }),
      )
      this.world.add(group, orbit)
      return { group, body, glow, label, orbit }
    })

    const moons = new THREE.InstancedMesh(this.moonGeometry, this.moonMaterial, model.moons.length)
    moons.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    model.moons.forEach((moon, i) => moons.setColorAt(i, p.status[moon.group]))
    if (moons.instanceColor) moons.instanceColor.needsUpdate = true
    moons.frustumCulled = false
    this.moons = moons
    this.world.add(moons)

    this.planetPositions.length = 0
    for (let i = 0; i < model.planets.length; i++) this.planetPositions.push(new THREE.Vector3())
    this.moonPositions.length = 0
    for (let i = 0; i < model.moons.length; i++) this.moonPositions.push(new THREE.Vector3())
    this.moonIndex = new Map(model.moons.map((m, i) => [m.entry.id, i]))
    this.hoveredIndex = -1
  }

  /* ─── Events ─── */

  private readonly handlePointerMove = (e: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.clientPointer.x = e.clientX - rect.left
    this.clientPointer.y = e.clientY - rect.top
    this.pointerDirty = true
  }

  private readonly handlePointerLeave = () => {
    this.pointer.set(-10, -10)
    this.pointerDirty = true
  }

  private readonly handlePointerDown = (e: PointerEvent) => {
    this.downAt = { x: e.clientX, y: e.clientY }
  }

  private readonly handlePointerUp = (e: PointerEvent) => {
    // A drag that moved more than a few pixels was an orbit, not a click.
    if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 5) return
    const moon = this.model?.moons[this.hoveredIndex]
    if (moon) this.callbacks.onPick(moon.entry.id)
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = `${w}px`
    this.renderer.domElement.style.height = `${h}px`
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /* ─── Frame ─── */

  private planetPosition(index: number, time: number, out: THREE.Vector3): THREE.Vector3 {
    const planet = this.model!.planets[index]!
    const a = planet.angle0 + time * planet.speed
    return out.set(
      Math.cos(a) * planet.orbitRadius,
      Math.sin(a) * planet.orbitRadius * planet.tilt,
      Math.sin(a) * planet.orbitRadius,
    )
  }

  private readonly loop = () => {
    this.frame = requestAnimationFrame(this.loop)
    const dt = Math.min(this.clock.getDelta(), 1 / 20)
    const orbitSpeed = this.reducedMotion ? 0.15 : 1
    this.elapsed += dt * orbitSpeed
    const t = this.elapsed
    const model = this.model

    if (model && this.replay.time !== null && this.replay.playing) {
      const next = this.replay.time + dt * 1000 * this.replay.speed
      const end = model.duration + MIN_FLIGHT_SECONDS * 1000 * this.replay.speed
      this.replay.time = Math.min(next, end)
      if (this.replay.time >= end) this.replay.playing = false
      if (performance.now() - this.lastTick > 80 || !this.replay.playing) {
        this.lastTick = performance.now()
        this.callbacks.onReplayTick(Math.min(this.replay.time, model.duration), this.replay.playing)
      }
    }

    if (model && this.moons) this.updateBodies(model, t)
    this.updateFocus(dt)
    this.controls.update()
    if (this.pointerDirty) this.updateHover()
    this.updateRings()
    this.renderer.render(this.scene, this.camera)
  }

  private updateBodies(model: GalaxyModel, t: number): void {
    const moons = this.moons!
    const replayTime = this.replay.time
    const speed = this.replay.speed
    const minFlight = MIN_FLIGHT_SECONDS * 1000 * speed
    const pulse = 1 + Math.sin(t * 1.6) * 0.03

    if (this.sun) this.sun.scale.setScalar(pulse)
    if (this.sunGlow) this.sunGlow.scale.setScalar(9 * (1 + Math.sin(t * 1.1) * 0.06))

    for (let i = 0; i < this.planets.length; i++) {
      const pos = this.planetPosition(i, t, this.planetPositions[i]!)
      const node = this.planets[i]!
      node.group.position.copy(pos)
      node.body.rotation.y = t * 0.4
    }

    let flights = 0
    for (let i = 0; i < model.moons.length; i++) {
      const moon = model.moons[i]!
      const parent = moon.planet === -1 ? this.tmpVec2.set(0, 0, 0) : this.planetPositions[moon.planet]!
      const a = moon.phase + t * moon.speed
      const r = moon.orbitRadius
      const home = this.moonPositions[i]!
      home.set(
        Math.cos(a) * r,
        Math.sin(a) * r * Math.sin(moon.incline),
        Math.sin(a) * r * Math.cos(moon.incline),
      )
      home.add(parent)

      let scale = moon.size
      if (replayTime !== null) {
        if (replayTime < moon.start) {
          moons.setMatrixAt(i, this.hidden)
          continue
        }
        const flight = Math.max(minFlight, moon.entry.time)
        const u = (replayTime - moon.start) / flight
        if (u < 1) {
          // In flight: an arc from the sun out to the moon's slot, with a fading trail.
          const eased = 1 - (1 - u) ** 2
          this.arcPoint(home, eased, this.tmpVec)
          home.copy(this.tmpVec)
          scale = moon.size * (1.2 + 0.6 * Math.sin(u * Math.PI))
          if (flights < MAX_FLIGHTS)
            this.writeTrail(flights++, this.moonPositions[i]!, eased, moon.group, i, t)
        }
      }

      this.tmpScale.setScalar(scale)
      this.tmpMatrix.compose(home, this.tmpQuat, this.tmpScale)
      moons.setMatrixAt(i, this.tmpMatrix)
    }
    moons.instanceMatrix.needsUpdate = true

    const geometry = this.trails.geometry
    geometry.setDrawRange(0, flights * TRAIL_SEGMENTS * 2)
    if (flights) {
      geometry.attributes.position!.needsUpdate = true
      geometry.attributes.color!.needsUpdate = true
    }
  }

  /** Point `u` of the way along a raised arc from the sun to `target`. */
  private arcPoint(target: THREE.Vector3, u: number, out: THREE.Vector3): THREE.Vector3 {
    const dist = target.length()
    out.copy(target).multiplyScalar(u)
    out.y += Math.sin(u * Math.PI) * dist * 0.28
    return out
  }

  private writeTrail(
    slot: number,
    _pos: THREE.Vector3,
    head: number,
    group: StatusGroup,
    index: number,
    t: number,
  ) {
    // The moon's slot moves while it flies, so recompute its resting position for the arc target.
    const moon = this.model!.moons[index]!
    const parent = moon.planet === -1 ? this.tmpVec2.set(0, 0, 0) : this.planetPositions[moon.planet]!
    const a = moon.phase + t * moon.speed
    const r = moon.orbitRadius
    const target = new THREE.Vector3(
      Math.cos(a) * r,
      Math.sin(a) * r * Math.sin(moon.incline),
      Math.sin(a) * r * Math.cos(moon.incline),
    ).add(parent)

    const color = this.tmpColor.copy(this.palette.status[group])
    const tail = Math.max(0, head - 0.35)
    const prev = new THREE.Vector3()
    const curr = new THREE.Vector3()
    this.arcPoint(target, tail, prev)
    for (let s = 0; s < TRAIL_SEGMENTS; s++) {
      const u = tail + ((head - tail) * (s + 1)) / TRAIL_SEGMENTS
      this.arcPoint(target, u, curr)
      const base = (slot * TRAIL_SEGMENTS + s) * 2
      this.trailPositions.set([prev.x, prev.y, prev.z, curr.x, curr.y, curr.z], base * 3)
      const a0 = (s / TRAIL_SEGMENTS) ** 1.5 * 0.9
      const a1 = ((s + 1) / TRAIL_SEGMENTS) ** 1.5 * 0.9
      this.trailColors.set([color.r, color.g, color.b, a0, color.r, color.g, color.b, a1], base * 4)
      prev.copy(curr)
    }
  }

  private updateFocus(dt: number): void {
    const target =
      this.focus === null || !this.model
        ? this.tmpVec.set(0, 0, 0)
        : this.focus === -1
          ? this.tmpVec.set(0, 0, 0)
          : this.tmpVec.copy(this.planetPositions[this.focus] ?? this.tmpVec.set(0, 0, 0))
    // Exponential approach: frame-rate independent and never overshoots.
    const k = 1 - Math.exp(-dt * 4)
    const before = this.controls.target.clone()
    this.controls.target.lerp(target, k)
    // Carry the camera along with its target so a moving planet stays framed.
    this.camera.position.add(this.tmpVec2.subVectors(this.controls.target, before))
    if (this.focusDistance > 0) {
      const offset = this.tmpVec2.subVectors(this.camera.position, this.controls.target)
      const len = offset.length()
      const next = len + (this.focusDistance - len) * k
      offset.setLength(next)
      this.camera.position.copy(this.controls.target).add(offset)
      if (Math.abs(next - this.focusDistance) < 0.05) this.focusDistance = 0
    }
  }

  private updateHover(): void {
    this.pointerDirty = false
    const moons = this.moons
    let index = -1
    if (moons && this.pointer.x > -2) {
      // Instanced raycasts test the bounding sphere first; moons move, so refresh it on demand.
      moons.computeBoundingSphere()
      this.raycaster.setFromCamera(this.pointer, this.camera)
      const hit = this.raycaster.intersectObject(moons, false)[0]
      if (hit?.instanceId !== undefined) index = hit.instanceId
    }
    if (index !== this.hoveredIndex) this.hoveredIndex = index
    const moon = index >= 0 ? this.model?.moons[index] : undefined
    this.renderer.domElement.style.cursor = moon ? 'pointer' : 'grab'
    this.callbacks.onHover(moon ? moon.entry.id : null, this.clientPointer.x, this.clientPointer.y)
  }

  private placeRing(ring: THREE.Mesh, index: number, factor: number): void {
    const moon = this.model?.moons[index]
    const pos = this.moonPositions[index]
    if (!moon || !pos) {
      ring.visible = false
      return
    }
    const hiddenByReplay = this.replay.time !== null && this.replay.time < moon.start
    ring.visible = !hiddenByReplay
    ring.position.copy(pos)
    ring.quaternion.copy(this.camera.quaternion)
    ring.scale.setScalar(moon.size * factor)
  }

  private updateRings(): void {
    const model = this.model
    if (!model) {
      this.selectionRing.visible = this.hoverRing.visible = false
      return
    }
    const selectedIndex = this.selectedId === null ? -1 : (this.moonIndex.get(this.selectedId) ?? -1)
    if (selectedIndex >= 0) {
      this.placeRing(this.selectionRing, selectedIndex, 1.6 + Math.sin(this.elapsed * 3) * 0.12)
      // Keep the ring readable even on the smallest moons.
      this.selectionRing.scale.setScalar(Math.max(this.selectionRing.scale.x, 0.25))
    } else this.selectionRing.visible = false
    if (this.hoveredIndex >= 0 && this.hoveredIndex !== selectedIndex) {
      this.placeRing(this.hoverRing, this.hoveredIndex, 1.5)
      this.hoverRing.scale.setScalar(Math.max(this.hoverRing.scale.x, 0.2))
    } else this.hoverRing.visible = false
  }
}
