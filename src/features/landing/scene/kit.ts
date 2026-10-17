import * as THREE from 'three'

/* ─── Motion primitives ───────────────────────────────────────────────────── */

/** Damped harmonic spring (semi-implicit Euler). Critically damped when c = 2√k. */
export class Spring {
  value: number
  velocity = 0
  target: number
  stiffness: number
  damping: number

  constructor(value = 0, stiffness = 120, damping = 2 * Math.sqrt(120)) {
    this.value = value
    this.target = value
    this.stiffness = stiffness
    this.damping = damping
  }

  step(dt: number): number {
    const force = (this.target - this.value) * this.stiffness - this.velocity * this.damping
    this.velocity += force * dt
    this.value += this.velocity * dt
    return this.value
  }
}

/** Vector spring — used for the camera rig and the packet so they never move linearly. */
export class Spring3 {
  readonly value = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  readonly target = new THREE.Vector3()
  stiffness: number
  damping: number
  private readonly force = new THREE.Vector3()

  constructor(stiffness = 60, damping = 2 * Math.sqrt(60)) {
    this.stiffness = stiffness
    this.damping = damping
  }

  snap(v: THREE.Vector3) {
    this.value.copy(v)
    this.target.copy(v)
    this.velocity.set(0, 0, 0)
  }

  step(dt: number): THREE.Vector3 {
    this.force
      .subVectors(this.target, this.value)
      .multiplyScalar(this.stiffness)
      .addScaledVector(this.velocity, -this.damping)
    this.velocity.addScaledVector(this.force, dt)
    this.value.addScaledVector(this.velocity, dt)
    return this.value
  }
}

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
export const smooth = (e0: number, e1: number, v: number) => {
  const t = clamp01((v - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
export const range = (p: number, a: number, b: number) => clamp01((p - a) / (b - a))

/** Deterministic PRNG so the constellation looks the same on every visit. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ─── Paths ───────────────────────────────────────────────────────────────── */

export interface Key {
  p: number
  v: THREE.Vector3
}

/**
 * A Catmull-Rom spline whose control points are pinned to story progress values,
 * so `sample(0.36)` lands exactly on the keyframe authored for p = 0.36.
 */
export class KeyedPath {
  private readonly keys: Key[]
  private readonly curve: THREE.CatmullRomCurve3

  constructor(keys: Key[]) {
    this.keys = keys.toSorted((a, b) => a.p - b.p)
    this.curve = new THREE.CatmullRomCurve3(
      this.keys.map((k) => k.v),
      false,
      'centripetal',
    )
  }

  sample(p: number, out: THREE.Vector3): THREE.Vector3 {
    const keys = this.keys
    const n = keys.length
    if (p <= keys[0]!.p) return out.copy(keys[0]!.v)
    if (p >= keys[n - 1]!.p) return out.copy(keys[n - 1]!.v)
    let i = 0
    while (i < n - 2 && p > keys[i + 1]!.p) i++
    const a = keys[i]!.p
    const b = keys[i + 1]!.p
    const local = (p - a) / (b - a)
    return this.curve.getPoint((i + local) / (n - 1), out)
  }
}

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/* ─── Palettes ────────────────────────────────────────────────────────────── */

export interface Palette {
  skyTop: THREE.Color
  skyMid: THREE.Color
  skyBottom: THREE.Color
  fog: THREE.Color
  hemiSky: THREE.Color
  hemiGround: THREE.Color
  ink: string
  glass: THREE.Color
  /** blocked, dns, connect, ssl, send, wait, receive */
  phases: THREE.Color[]
  pastel: THREE.Color[]
  packet: THREE.Color
  labelBg: string
  labelInk: string
}

const c = (hex: string) => new THREE.Color(hex)

export const PALETTES: Record<'light' | 'dark', Palette> = {
  light: {
    skyTop: c('#dcd3fb'),
    skyMid: c('#fdf6ef'),
    skyBottom: c('#fbd6c4'),
    fog: c('#f3ecf3'),
    hemiSky: c('#f3eeff'),
    hemiGround: c('#ffe6d8'),
    ink: '#4a4366',
    glass: c('#ffffff'),
    phases: ['#c9c5d3', '#6fbf9f', '#ee9e78', '#9b8de0', '#8cc07a', '#78aee3', '#e5bd5c'].map(c),
    pastel: ['#b9b2e8', '#f4c3ac', '#a8d4bd', '#a9cce3', '#efb8c6', '#f2df9e'].map(c),
    packet: c('#a99cf0'),
    labelBg: 'rgba(255,253,250,0.86)',
    labelInk: '#4a4366',
  },
  dark: {
    skyTop: c('#272a52'),
    skyMid: c('#3a3866'),
    skyBottom: c('#5c4a72'),
    fog: c('#3a3766'),
    hemiSky: c('#9b96d6'),
    hemiGround: c('#6a4f6e'),
    ink: '#f3eee6',
    glass: c('#cfd0f5'),
    phases: ['#8e8aa6', '#7fd0b0', '#f2ad8b', '#b3a7f0', '#9fd28d', '#8fc0f0', '#f0cd75'].map(c),
    pastel: ['#b3a7f0', '#f2ad8b', '#8fd6b4', '#8fc0f0', '#f0a7bb', '#f0d68a'].map(c),
    packet: c('#c6bcff'),
    labelBg: 'rgba(52,50,92,0.82)',
    labelInk: '#f3eee6',
  },
}

/* ─── Textures ────────────────────────────────────────────────────────────── */

export function glowTexture(): THREE.Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

export interface LabelOptions {
  bg: string
  ink: string
  accent?: string
  mono?: boolean
  height?: number
}

/** Pill-shaped text sprite, drawn once into a canvas at 2× for crisp edges. */
export function makeLabel(text: string, o: LabelOptions): THREE.Sprite {
  const scale = 2
  const fontSize = 30 * scale
  const font = `${o.mono ? '500' : '600'} ${fontSize}px ${o.mono ? "'Geist Mono Variable', monospace" : "'Geist Variable', sans-serif"}`
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = font
  const pad = 26 * scale
  const dot = o.accent ? 26 * scale : 0
  const w = Math.ceil(measure.measureText(text).width + pad * 2 + dot)
  const h = 64 * scale
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  roundRect(ctx, 2, 2, w - 4, h - 4, (h - 4) / 2)
  ctx.fillStyle = o.bg
  ctx.fill()
  ctx.lineWidth = 2 * scale
  ctx.strokeStyle = 'rgba(160,150,200,0.35)'
  ctx.stroke()
  if (o.accent) {
    ctx.fillStyle = o.accent
    ctx.beginPath()
    ctx.arc(pad + 7 * scale, h / 2, 7 * scale, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.font = font
  ctx.fillStyle = o.ink
  ctx.textBaseline = 'middle'
  ctx.fillText(text, pad + dot, h / 2 + scale)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 })
  const sprite = new THREE.Sprite(mat)
  const height = o.height ?? 0.5
  sprite.scale.set((height * w) / h, height, 1)
  sprite.renderOrder = 10
  return sprite
}

/** Soft round point sprite shared by every particle system. */
export const POINT_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`
