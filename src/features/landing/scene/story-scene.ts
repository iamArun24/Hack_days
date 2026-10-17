import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { toEntries } from '@/har/parse'
import { createSampleLog } from '@/har/sample'
import { phaseSegments, PHASES } from '@/har/timings'
import {
  clamp01,
  easeInOutCubic,
  easeOutCubic,
  glowTexture,
  KeyedPath,
  makeLabel,
  mulberry32,
  PALETTES,
  POINT_FRAG,
  range,
  smooth,
  Spring,
  Spring3,
  v3,
  type LabelOptions,
  type Palette,
} from './kit'

/*
 * The landing film. One continuous camera flight through seven stations, each a
 * stage of an HTTP request (see ../acts.ts). Everything is driven by two clocks:
 *   - story progress `p` (scroll, smoothed by a spring so motion has inertia)
 *   - wall time `t` (idle motion, particles, physics)
 */

export interface StorySceneOptions {
  canvas: HTMLCanvasElement
  dark: boolean
  reducedMotion: boolean
  onIntro?: (phase: 'assemble' | 'title' | 'done') => void
}

interface Frame {
  p: number
  t: number
  dt: number
  /** Time scale for ambient motion — slows during the TTFB act. */
  slow: number
}

type Updater = (f: Frame) => void

const INTRO = { assemble: 2.4, hold: 3.1, dissolve: 4.4 }

/* Stations */
const BUTTON = v3(1.77, -1.35, 0.3)
const ROUTE = [v3(-9, 5, -39), v3(-15, 8.5, -47), v3(-19, 5.5, -55), v3(-12, 3, -62)]
const HAND = v3(10, 2, -90)
const TOWER = v3(0, -2, -140)
const ARCHIVE = v3(-20, 0, -206)
const PORTAL = v3(-20, 4, -262)
const CLICK_P = 0.06 + 0.14 * 0.45

const CAMERA = new KeyedPath([
  { p: 0, v: v3(0, 1.4, 15) },
  { p: 0.06, v: v3(0, 0.8, 9.5) },
  { p: 0.14, v: v3(3.8, 0.6, 5.2) },
  { p: 0.2, v: v3(-3, 4, -17) },
  { p: 0.27, v: v3(-1, 9.5, -27) },
  { p: 0.32, v: v3(-4, 8, -43) },
  { p: 0.36, v: v3(-1, 5, -67) },
  { p: 0.42, v: v3(10, 3.6, -79.5) },
  { p: 0.48, v: v3(14.5, 4.4, -81) },
  { p: 0.52, v: v3(7, 3.4, -110) },
  { p: 0.57, v: v3(8.5, 3, -127) },
  { p: 0.62, v: v3(-9, 2.4, -131) },
  { p: 0.66, v: v3(-6.5, 6.5, -151) },
  { p: 0.71, v: v3(13, 7, -158) },
  { p: 0.76, v: v3(5, 5.5, -181) },
  { p: 0.81, v: v3(-13, 1.8, -183) },
  { p: 0.86, v: v3(-20, 0.4, -186.5) },
  { p: 0.9, v: v3(-25.5, 1.2, -189) },
  { p: 0.95, v: v3(-15, 6.5, -212) },
  { p: 1, v: v3(-20, 4, -247) },
])

const LOOK = new KeyedPath([
  { p: 0, v: v3(0, 0.4, 0) },
  { p: 0.06, v: v3(0, 0.2, 0) },
  { p: 0.14, v: v3(0.6, -0.4, -1.5) },
  { p: 0.2, v: v3(-9, 5, -38) },
  { p: 0.27, v: v3(-14, 6, -49) },
  { p: 0.32, v: v3(-15, 5, -60) },
  { p: 0.36, v: v3(6, 2.5, -86) },
  { p: 0.42, v: HAND.clone().add(v3(0, 0.8, 0)) },
  { p: 0.48, v: v3(10, 3.2, -90) },
  { p: 0.52, v: v3(0, 0.5, -140) },
  { p: 0.57, v: v3(0, 1, -140) },
  { p: 0.62, v: v3(0, 1, -140) },
  { p: 0.66, v: v3(0, 2.5, -145) },
  { p: 0.71, v: v3(-1, 3.5, -161) },
  { p: 0.76, v: v3(-12, 2.4, -184) },
  { p: 0.81, v: v3(-20, 1.2, -204) },
  { p: 0.86, v: v3(-20, 1.4, -206) },
  { p: 0.9, v: v3(-19, 1.2, -206) },
  { p: 0.95, v: v3(-20, 3.5, -240) },
  { p: 1, v: PORTAL.clone() },
])

const PACKET = new KeyedPath([
  { p: 0, v: BUTTON.clone() },
  { p: CLICK_P, v: BUTTON.clone().add(v3(0, 0, 0.3)) },
  { p: 0.165, v: v3(2.2, 1.2, -6) },
  { p: 0.205, v: ROUTE[0]!.clone() },
  { p: 0.245, v: ROUTE[1]!.clone() },
  { p: 0.285, v: ROUTE[2]!.clone() },
  { p: 0.325, v: ROUTE[3]!.clone() },
  { p: 0.385, v: HAND.clone().add(v3(-3, 0, 0)) },
  { p: 0.47, v: HAND.clone().add(v3(-3, 0, 0)) },
  { p: 0.5, v: HAND.clone() },
  { p: 0.545, v: v3(0, 5.5, -136) },
  { p: 0.6, v: v3(0, 2.2, -140) },
  { p: 0.66, v: v3(0, 4.6, -140) },
])

const RIVER = [
  v3(0, 4.6, -140),
  v3(3.5, 5, -150),
  v3(-1, 3.6, -162),
  v3(-9, 2.6, -176),
  v3(-15, 2.4, -190),
  v3(-20, 2.8, -201),
]

export class StoryScene {
  private readonly renderer: THREE.WebGLRenderer
  private readonly composer: EffectComposer
  private readonly bloom: UnrealBloomPass
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 900)
  private readonly clock = new THREE.Clock()
  private readonly opts: StorySceneOptions
  private palette: Palette
  private readonly updaters: Updater[] = []
  private readonly themers: Array<(p: Palette) => void> = []
  private readonly disposables: Array<{ dispose: () => void }> = []

  private readonly progress = new Spring(0, 28, 2 * Math.sqrt(28) * 1.05)
  private readonly rig = new Spring3(34, 2 * Math.sqrt(34))
  private readonly gaze = new Spring3(40, 2 * Math.sqrt(40))
  private readonly pointer = new Spring3(18, 2 * Math.sqrt(18))
  private readonly pointerTarget = new THREE.Vector2()

  private introTime = 0
  private introPhase: 'assemble' | 'title' | 'done' | null = null
  private running = false
  private raf = 0
  private width = 1
  private height = 1
  private pixelRatio = 1
  private frameTimes: number[] = []
  private lastDprCheck = 0

  private readonly sky: THREE.Mesh
  private readonly skyUniforms = {
    uTop: { value: new THREE.Color() },
    uMid: { value: new THREE.Color() },
    uBottom: { value: new THREE.Color() },
    uTime: { value: 0 },
  }
  private readonly hemi: THREE.HemisphereLight
  private glow!: THREE.Texture
  private physics!: Physics

  constructor(opts: StorySceneOptions) {
    this.opts = opts
    this.palette = PALETTES[opts.dark ? 'dark' : 'light']

    const renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    renderer.toneMapping = THREE.AgXToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer = renderer
    this.pixelRatio = Math.min(window.devicePixelRatio, 1.75)
    renderer.setPixelRatio(this.pixelRatio)

    this.scene.fog = new THREE.FogExp2(this.palette.fog, 0.009)

    this.hemi = new THREE.HemisphereLight(this.palette.hemiSky, this.palette.hemiGround, 1.5)
    this.scene.add(this.hemi)
    const sun = new THREE.DirectionalLight('#fff4ea', 1.6)
    sun.position.set(6, 12, 8)
    this.scene.add(sun)
    const rim = new THREE.DirectionalLight('#c9c0ff', 0.9)
    rim.position.set(-8, 4, -10)
    this.scene.add(rim)

    this.sky = this.buildSky()

    this.composer = new EffectComposer(renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.55, 1.0)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())

    const start = CAMERA.sample(0, new THREE.Vector3())
    this.rig.snap(start)
    this.gaze.snap(LOOK.sample(0, new THREE.Vector3()))
    this.camera.position.copy(start)
  }

  /** Builds everything that needs fonts (labels) — call once fonts are ready. */
  build(): void {
    this.glow = glowTexture()
    this.disposables.push(this.glow)
    this.buildDust()
    this.buildIntro()
    const browser = this.buildBrowser()
    this.buildPacket()
    this.buildDns()
    this.buildHandshake()
    this.buildServer()
    this.buildRiver()
    this.buildArchive()
    this.buildPortal()
    this.physics = new Physics(this.scene, this.palette)
    this.disposables.push(this.physics)
    this.updaters.push((f) => this.physics.step(f.dt, this.camera.position.y - 5.5))
    void browser
    this.applyTheme()
    if (this.opts.reducedMotion) this.introTime = INTRO.dissolve
  }

  /* ─── Public API ─── */

  start(): void {
    if (this.running) return
    this.running = true
    this.clock.start()
    const loop = () => {
      if (!this.running) return
      this.raf = requestAnimationFrame(loop)
      this.frame()
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  setProgress(p: number): void {
    this.progress.target = clamp01(p)
  }

  setPointer(x: number, y: number): void {
    this.pointerTarget.set(x, y)
  }

  setDark(dark: boolean): void {
    this.palette = PALETTES[dark ? 'dark' : 'light']
    this.applyTheme()
  }

  skipIntro(): void {
    this.introTime = Math.max(this.introTime, INTRO.dissolve)
  }

  get introDone(): boolean {
    return this.introTime >= INTRO.dissolve
  }

  /** Click anywhere: a little fountain of packets with real gravity. */
  burst(ndcX: number, ndcY: number): void {
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera)
    const origin = ray.ray.at(7, new THREE.Vector3())
    this.physics.burst(origin, 46)
  }

  /** Konami code: a packet storm that rains and bounces off an invisible floor. */
  storm(): void {
    const forward = new THREE.Vector3()
    this.camera.getWorldDirection(forward)
    const center = this.camera.position.clone().addScaledVector(forward, 9)
    this.physics.storm(center, 650)
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.camera.aspect = this.width / this.height
    this.camera.fov = this.camera.aspect < 0.8 ? 62 : 48
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(this.width, this.height, false)
    this.composer.setSize(this.width, this.height)
    this.bloom.resolution.set(this.width / 2, this.height / 2)
  }

  dispose(): void {
    this.stop()
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      mesh.geometry?.dispose()
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
      for (const m of mats) {
        for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose()
        m.dispose()
      }
    })
    for (const d of this.disposables) d.dispose()
    this.composer.dispose()
    this.renderer.dispose()
  }

  /* ─── Frame ─── */

  private frame(): void {
    const dt = Math.min(1 / 30, this.clock.getDelta())
    const t = this.clock.elapsedTime
    if (!this.introDone) this.introTime += dt
    this.reportIntro()

    const p = this.progress.step(dt)
    const ttfb = range(p, 0.52, 0.66)
    const slow = 1 - 0.78 * Math.sin(Math.PI * ttfb) ** 2
    const f: Frame = { p, t, dt, slow }

    // Camera: spline target → spring rig → pointer parallax + a whisper of handheld drift.
    CAMERA.sample(p, this.rig.target)
    LOOK.sample(p, this.gaze.target)
    this.rig.step(dt)
    this.gaze.step(dt)
    this.pointer.target.set(this.pointerTarget.x, this.pointerTarget.y, 0)
    this.pointer.step(dt)

    const forward = new THREE.Vector3().subVectors(this.gaze.value, this.rig.value).normalize()
    const right = new THREE.Vector3().crossVectors(forward, THREE.Object3D.DEFAULT_UP).normalize()
    const up = new THREE.Vector3().crossVectors(right, forward)
    const sway = this.opts.reducedMotion ? 0 : 1
    this.camera.position
      .copy(this.rig.value)
      .addScaledVector(right, this.pointer.value.x * 0.9 * sway + Math.sin(t * 0.37) * 0.06 * sway)
      .addScaledVector(up, this.pointer.value.y * 0.55 * sway + Math.sin(t * 0.53 + 1) * 0.05 * sway)
    this.camera.lookAt(this.gaze.value)
    const lift = 0.13 * (1 - smooth(0.9, 0.99, p)) * (this.camera.aspect < 0.8 ? 1.3 : 1)
    this.camera.setViewOffset(this.width, this.height, 0, this.height * lift, this.width, this.height)
    this.camera.rotateZ(-this.pointer.value.x * 0.025 * sway)

    this.sky.position.copy(this.camera.position)
    this.skyUniforms.uTime.value = t

    for (const update of this.updaters) update(f)
    this.composer.render(dt)
    this.adaptResolution(dt, t)
  }

  private reportIntro(): void {
    const phase =
      this.introTime < INTRO.assemble ? 'assemble' : this.introTime < INTRO.dissolve - 0.6 ? 'title' : 'done'
    if (phase !== this.introPhase) {
      this.introPhase = phase
      this.opts.onIntro?.(phase)
    }
  }

  /** Drops pixel ratio on slow GPUs instead of stuttering. */
  private adaptResolution(dt: number, t: number): void {
    this.frameTimes.push(dt)
    if (this.frameTimes.length > 50) this.frameTimes.shift()
    if (t - this.lastDprCheck < 2 || this.frameTimes.length < 50) return
    this.lastDprCheck = t
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
    const max = Math.min(window.devicePixelRatio, 1.75)
    const next =
      avg > 0.024
        ? Math.max(0.75, this.pixelRatio - 0.25)
        : avg < 0.013
          ? Math.min(max, this.pixelRatio + 0.25)
          : this.pixelRatio
    if (next !== this.pixelRatio) {
      this.pixelRatio = next
      this.renderer.setPixelRatio(next)
      this.resize(this.width, this.height)
    }
  }

  private applyTheme(): void {
    const pal = this.palette
    this.skyUniforms.uTop.value.copy(pal.skyTop)
    this.skyUniforms.uMid.value.copy(pal.skyMid)
    this.skyUniforms.uBottom.value.copy(pal.skyBottom)
    ;(this.scene.fog as THREE.FogExp2).color.copy(pal.fog)
    this.hemi.color.copy(pal.hemiSky)
    this.hemi.groundColor.copy(pal.hemiGround)
    const dark = this.palette === PALETTES.dark
    this.bloom.strength = dark ? 0.85 : 0.6
    this.bloom.threshold = dark ? 0.85 : 1.0
    this.renderer.toneMapping = dark ? THREE.AgXToneMapping : THREE.NeutralToneMapping
    this.renderer.toneMappingExposure = dark ? 1.15 : 1
    for (const theme of this.themers) theme(pal)
    // Additive glow vanishes on cream paper, so light mode blends particles normally.
    this.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Points)) return
      const mat = obj.material as THREE.ShaderMaterial
      mat.userData.glow ??= mat.blending === THREE.AdditiveBlending
      if (!mat.userData.glow) return
      mat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending
      mat.needsUpdate = true
    })
  }

  /* ─── Builders ─── */

  private label(text: string, o: Partial<LabelOptions> & { accentIndex?: number } = {}): THREE.Sprite {
    const draw = (pal: Palette) => {
      const accent = o.accentIndex === undefined ? o.accent : `#${pal.phases[o.accentIndex]!.getHexString()}`
      return makeLabel(text, { bg: pal.labelBg, ink: pal.labelInk, ...o, accent })
    }
    const sprite = draw(this.palette)
    this.themers.push((pal) => {
      const fresh = draw(pal)
      const mat = sprite.material
      mat.map?.dispose()
      mat.map = fresh.material.map
      mat.needsUpdate = true
      fresh.material.dispose()
    })
    return sprite
  }

  private buildSky(): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.skyUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBottom; uniform float uTime;
        varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 col = h > 0.0 ? mix(uMid, uTop, smoothstep(0.0, 0.7, h)) : mix(uMid, uBottom, smoothstep(0.0, -0.55, h));
          float clouds = sin(vDir.x * 3.1 + uTime * 0.03) * sin(vDir.z * 2.7 - uTime * 0.02) * sin(vDir.y * 4.0 + 1.3);
          col += clouds * 0.025;
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
    const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 48, 24), mat)
    sky.renderOrder = -1
    this.scene.add(sky)
    return sky
  }

  /** Pastel dust along the whole flight; drift slows with time during the wait. */
  private buildDust(): void {
    const count = 2800
    const rand = mulberry32(7)
    const pos = new Float32Array(count * 3)
    const color = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = -45 + rand() * 80
      pos[i * 3 + 1] = -14 + rand() * 32
      pos[i * 3 + 2] = 25 - rand() * 300
      seed[i] = rand()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    const uniforms = { uTime: { value: 0 }, uScale: { value: 1 }, uOpacity: { value: 0.75 } }
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uScale;
        attribute vec3 aColor; attribute float aSeed;
        varying vec3 vColor; varying float vAlpha;
        uniform float uOpacity;
        void main() {
          vec3 p = position;
          float t = uTime * 0.22 + aSeed * 6.2831;
          p.x += sin(t + p.y * 0.15) * 0.9;
          p.y += cos(t * 0.8 + p.z * 0.1) * 0.7;
          p.z += sin(t * 0.6 + p.x * 0.12) * 0.9;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(uScale * (0.35 + aSeed * 0.9) * (95.0 / -mv.z), uScale * 14.0);
          vColor = aColor;
          vAlpha = uOpacity * smoothstep(110.0, 12.0, -mv.z) * smoothstep(0.6, 3.0, -mv.z);
        }`,
      fragmentShader: POINT_FRAG,
    })
    this.scene.add(new THREE.Points(geo, mat))

    this.themers.push((pal) => {
      for (let i = 0; i < count; i++) {
        const c = pal.pastel[i % pal.pastel.length]!
        color.set([c.r, c.g, c.b], i * 3)
      }
      geo.attributes.aColor!.needsUpdate = true
    })
    let time = 0
    this.updaters.push((f) => {
      time += f.dt * f.slow
      uniforms.uTime.value = time
      uniforms.uScale.value = this.pixelRatio * Math.min(this.height / 900, 1.4)
    })
  }

  /** Light gathers into the logo, holds, then pours itself into the browser window. */
  private buildIntro(): void {
    const rand = mulberry32(42)
    const count = 2400
    const start = new Float32Array(count * 3)
    const logo = new Float32Array(count * 3)
    const end = new Float32Array(count * 3)
    const delay = new Float32Array(count)
    const color = new Float32Array(count * 3)

    // Logo: three rounded bars inside a rounded square (the LogoMark), on a 32-unit grid.
    const bars = [
      [7, 9, 10, 3],
      [11, 14.5, 14, 3],
      [9, 20, 8, 3],
    ] as const
    const S = 0.11
    const toWorld = (x: number, y: number, out: Float32Array, i: number) => {
      out[i * 3] = (x - 16) * S
      out[i * 3 + 1] = (16 - y) * S + 0.6
      out[i * 3 + 2] = 4.5 + (rand() - 0.5) * 0.25
    }
    for (let i = 0; i < count; i++) {
      const r = 18 + rand() * 22
      const th = rand() * Math.PI * 2
      const ph = Math.acos(2 * rand() - 1)
      start[i * 3] = r * Math.sin(ph) * Math.cos(th)
      start[i * 3 + 1] = r * Math.cos(ph) * 0.6
      start[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) - 6

      if (i < count * 0.62) {
        const bar = bars[i % 3]!
        toWorld(bar[0] + rand() * bar[2], bar[1] + rand() * bar[3], logo, i)
      } else {
        // Rounded-square outline.
        const s = rand() * 4
        const side = Math.floor(s)
        const u = 3 + (s - side) * 26
        const [x, y] = side === 0 ? [u, 2.5] : side === 1 ? [29.5, u] : side === 2 ? [u, 29.5] : [2.5, u]
        toWorld(x + (rand() - 0.5) * 0.9, y + (rand() - 0.5) * 0.9, logo, i)
      }
      // Dissolve target: scattered over the browser frame's face.
      end[i * 3] = (rand() - 0.5) * 6.2
      end[i * 3 + 1] = (rand() - 0.5) * 4
      end[i * 3 + 2] = 0.2
      delay[i] = rand()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(logo, 3))
    geo.setAttribute('aStart', new THREE.BufferAttribute(start, 3))
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 3))
    geo.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1))
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
    const uniforms = {
      uAssemble: { value: 0 },
      uDissolve: { value: 0 },
      uTime: { value: 0 },
      uScale: { value: 1 },
    }
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uAssemble; uniform float uDissolve; uniform float uTime; uniform float uScale;
        attribute vec3 aStart; attribute vec3 aEnd; attribute float aDelay; attribute vec3 aColor;
        varying vec3 vColor; varying float vAlpha;
        vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c) * v; }
        void main() {
          float a = clamp((uAssemble - aDelay * 0.35) / 0.65, 0.0, 1.0);
          a = 1.0 - pow(1.0 - a, 3.0);
          vec3 p = mix(aStart, position, a);
          p.xz = rot(p.xz, (1.0 - a) * 2.4);
          p += vec3(sin(uTime * 2.0 + aDelay * 30.0), cos(uTime * 1.7 + aDelay * 20.0), 0.0) * 0.025 * a;
          float d = clamp((uDissolve - aDelay * 0.3) / 0.7, 0.0, 1.0);
          d = d < 0.5 ? 4.0 * d * d * d : 1.0 - pow(-2.0 * d + 2.0, 3.0) / 2.0;
          vec3 mid = mix(p, aEnd, 0.5) + vec3(0.0, 1.2, 1.5) * sin(d * 3.14159);
          p = mix(mix(p, mid, d), mix(mid, aEnd, d), d);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uScale * (1.4 + aDelay * 1.6) * (14.0 / -mv.z) * (1.0 + (1.0 - a) * 1.5);
          vColor = aColor;
          vAlpha = (0.25 + 0.75 * a) * (1.0 - d * d) * smoothstep(0.0, 0.15, uAssemble);
        }`,
      fragmentShader: POINT_FRAG,
    })
    const points = new THREE.Points(geo, mat)
    points.frustumCulled = false
    this.scene.add(points)

    this.themers.push((pal) => {
      for (let i = 0; i < count; i++) {
        const c = i % 5 === 0 ? pal.packet : pal.pastel[i % pal.pastel.length]!
        color.set([c.r * 0.9, c.g * 0.9, c.b * 0.9], i * 3)
      }
      geo.attributes.aColor!.needsUpdate = true
    })
    this.updaters.push((f) => {
      const it = this.introTime
      uniforms.uAssemble.value = clamp01(it / INTRO.assemble)
      uniforms.uDissolve.value = range(it, INTRO.hold, INTRO.dissolve)
      uniforms.uTime.value = f.t
      uniforms.uScale.value = this.pixelRatio * (this.height / 900) * 10
      points.visible = it < INTRO.dissolve + 0.1
    })
  }

  /* Act 1 — the browser window, the click, the packet's birth. */
  private buildBrowser(): THREE.Group {
    const group = new THREE.Group()
    this.scene.add(group)

    const frameMat = new THREE.MeshPhysicalMaterial({
      roughness: 0.28,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.18,
      sheen: 1,
      transparent: true,
      opacity: 0.94,
    })
    const frame = new THREE.Mesh(new RoundedBoxGeometry(6.3, 4.05, 0.3, 6, 0.3), frameMat)
    group.add(frame)

    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 627
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(5.8, 3.55),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true }),
    )
    screen.position.z = 0.16
    group.add(screen)

    let pressed = 0
    const drawScreen = (pal: Palette, dark: boolean) => {
      const ctx = canvas.getContext('2d')!
      const hex = (c: THREE.Color, a = 1) =>
        `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${a})`
      const [lav, peach, sage, sky, blush, butter] = pal.pastel as [
        THREE.Color,
        THREE.Color,
        THREE.Color,
        THREE.Color,
        THREE.Color,
        THREE.Color,
      ]
      const bg = ctx.createLinearGradient(0, 0, 1024, 627)
      bg.addColorStop(0, dark ? '#3b3a68' : '#fffaf5')
      bg.addColorStop(1, dark ? '#45406f' : '#f6f0ff')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, 1024, 627)
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(120,100,180,0.06)'
      ctx.fillRect(0, 0, 1024, 58)
      ;[blush, butter, sage].forEach((c, i) => {
        ctx.fillStyle = hex(c)
        ctx.beginPath()
        ctx.arc(34 + i * 30, 29, 9, 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.9)'
      ctx.beginPath()
      ctx.roundRect(150, 14, 560, 30, 15)
      ctx.fill()
      ctx.fillStyle = pal.ink
      ctx.globalAlpha = 0.7
      ctx.font = "500 17px 'Geist Mono Variable', monospace"
      ctx.textBaseline = 'middle'
      ctx.fillText('🔒 lumen.dev/shop', 170, 30)
      ctx.globalAlpha = 1

      const hero = ctx.createLinearGradient(40, 90, 600, 300)
      hero.addColorStop(0, hex(lav, 0.95))
      hero.addColorStop(1, hex(sky, 0.85))
      ctx.fillStyle = hero
      ctx.beginPath()
      ctx.roundRect(40, 86, 600, 220, 26)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.font = "600 44px 'Fraunces Variable', Georgia, serif"
      ctx.fillText('Soft goods,', 76, 160)
      ctx.fillText('calm prices.', 76, 214)
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.beginPath()
      ctx.roundRect(76, 250, 180, 18, 9)
      ctx.fill()

      ;[peach, sage, butter].forEach((c, i) => {
        const x = 668 + 0
        const y = 86 + i * 76
        ctx.fillStyle = hex(c, 0.9)
        ctx.beginPath()
        ctx.roundRect(x, y, 316, 64, 18)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.75)'
        ctx.beginPath()
        ctx.arc(x + 32, y + 32, 16, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.roundRect(x + 62, y + 18, 150 - i * 25, 12, 6)
        ctx.roundRect(x + 62, y + 38, 90, 10, 5)
        ctx.fill()
      })
      ;[blush, sky, lav].forEach((c, i) => {
        ctx.fillStyle = hex(c, 0.55)
        ctx.beginPath()
        ctx.roundRect(40 + i * 205, 330, 188, 150, 20)
        ctx.fill()
      })
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(120,100,180,0.08)'
      ctx.beginPath()
      ctx.roundRect(40, 500, 600, 92, 20)
      ctx.fill()

      // The button the cursor presses — its centre maps to BUTTON in world space.
      const press = pressed
      ctx.save()
      ctx.translate(825, 552)
      ctx.scale(1 - press * 0.06, 1 - press * 0.06)
      const btn = ctx.createLinearGradient(-125, 0, 125, 0)
      btn.addColorStop(0, `#${pal.packet.getHexString()}`)
      btn.addColorStop(1, hex(blush))
      ctx.fillStyle = btn
      ctx.shadowColor = 'rgba(150,120,230,0.45)'
      ctx.shadowBlur = 24 * (1 - press)
      ctx.beginPath()
      ctx.roundRect(-125, -34, 250, 68, 34)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.fillStyle = '#ffffff'
      ctx.font = "600 24px 'Geist Variable', sans-serif"
      ctx.textAlign = 'center'
      ctx.fillText('Add to cart', 0, 2)
      ctx.restore()
      ctx.textAlign = 'left'
      tex.needsUpdate = true
    }

    // 3D cursor arrow.
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    shape.lineTo(0, -1)
    shape.lineTo(0.28, -0.75)
    shape.lineTo(0.48, -1.15)
    shape.lineTo(0.62, -1.08)
    shape.lineTo(0.42, -0.68)
    shape.lineTo(0.76, -0.68)
    shape.closePath()
    const arrow = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.08,
        bevelEnabled: true,
        bevelSize: 0.03,
        bevelThickness: 0.03,
        bevelSegments: 3,
      }),
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.3,
        emissive: '#efeaff',
        emissiveIntensity: 0.15,
      }),
    )
    arrow.scale.setScalar(0.42)
    group.add(arrow)

    const ripple = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.36, 64),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    )
    ripple.position.copy(BUTTON).setZ(0.2)
    group.add(ripple)

    // Floating satellite cards for depth.
    const cards = [
      { pos: v3(-4.4, 1.6, -0.8), size: [1.6, 1, 0.12], tint: 0 },
      { pos: v3(4.3, 1.9, -1.4), size: [1.3, 0.8, 0.12], tint: 2 },
      { pos: v3(-3.9, -2.1, 0.6), size: [1.2, 0.75, 0.12], tint: 1 },
    ].map(({ pos, size, tint }) => {
      const mat = new THREE.MeshPhysicalMaterial({
        roughness: 0.35,
        clearcoat: 1,
        transparent: true,
        opacity: 0.9,
      })
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(size[0]!, size[1]!, size[2]!, 4, 0.1), mat)
      mesh.position.copy(pos)
      group.add(mesh)
      return { mesh, mat, pos, tint }
    })

    this.themers.push((pal) => {
      frameMat.color.copy(pal.glass).lerp(pal.pastel[0]!, 0.25)
      frameMat.sheenColor.copy(pal.pastel[0]!)
      for (const c of cards) c.mat.color.copy(pal.pastel[c.tint]!)
      ;(ripple.material as THREE.MeshBasicMaterial).color.copy(pal.packet)
      drawScreen(pal, this.palette === PALETTES.dark)
    })

    const appear = new Spring(0, 90, 11)
    const from = v3(3.6, -2.4, 1.1)
    const to = BUTTON.clone().add(v3(-0.02, 0.02, 0.12))
    const arrowPos = new THREE.Vector3()
    let lastPressed = -1
    this.updaters.push((f) => {
      appear.target = this.introTime > INTRO.hold + 0.4 ? 1 : 0
      const s = Math.max(0, appear.step(f.dt))
      group.scale.setScalar(0.6 + 0.4 * s)
      frameMat.opacity = 0.94 * clamp01(s)
      ;(screen.material as THREE.MeshBasicMaterial).opacity = clamp01(s)
      group.visible = f.p < 0.3
      group.rotation.y = Math.sin(f.t * 0.3) * 0.04 - this.pointer.value.x * 0.06
      group.rotation.x = Math.sin(f.t * 0.25) * 0.02 + this.pointer.value.y * 0.04
      group.position.y = Math.sin(f.t * 0.6) * 0.06

      const local = range(f.p, 0.06, 0.2)
      const travel = easeInOutCubic(range(local, 0.05, 0.4))
      arrowPos.lerpVectors(from, to, travel)
      arrowPos.y += Math.sin(travel * Math.PI) * 0.35
      const press = smooth(0.38, 0.43, local) * (1 - smooth(0.48, 0.56, local))
      arrowPos.z -= press * 0.08
      arrow.position.copy(arrowPos)
      arrow.rotation.z = 0.25 - travel * 0.15
      arrow.visible = s > 0.2 && local < 0.95
      ;(arrow.material as THREE.MeshStandardMaterial).opacity = 1
      pressed = press
      const q = Math.round(press * 10)
      if (q !== lastPressed) {
        lastPressed = q
        drawScreen(this.palette, this.palette === PALETTES.dark)
      }
      const rip = range(local, 0.44, 0.85)
      ripple.scale.setScalar(1 + easeOutCubic(rip) * 5)
      ;(ripple.material as THREE.MeshBasicMaterial).opacity = rip > 0 ? (1 - rip) * 0.8 : 0

      for (const [i, c] of cards.entries()) {
        c.mesh.position.y = c.pos.y + Math.sin(f.t * 0.8 + i * 2) * 0.12
        c.mesh.rotation.y = Math.sin(f.t * 0.4 + i) * 0.15
        c.mesh.rotation.x = Math.cos(f.t * 0.35 + i) * 0.08
        c.mesh.scale.setScalar(Math.max(0.001, s))
      }
    })
    return group
  }

  /* The packet: a glowing orb with a comet trail, on a spring behind its keyed path. */
  private buildPacket(): void {
    const group = new THREE.Group()
    const coreMat = new THREE.MeshBasicMaterial({ toneMapped: false })
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 4), coreMat)
    const haloMat = new THREE.SpriteMaterial({
      map: this.glow,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.9,
    })
    const halo = new THREE.Sprite(haloMat)
    halo.scale.setScalar(2.2)
    group.add(core, halo)
    this.scene.add(group)

    const light = new THREE.PointLight('#b9adff', 0, 9, 1.6)
    group.add(light)

    const TRAIL = 64
    const trailPos = new Float32Array(TRAIL * 3)
    const trailAlpha = new Float32Array(TRAIL)
    for (let i = 0; i < TRAIL; i++) trailAlpha[i] = 1 - i / TRAIL
    const trailGeo = new THREE.BufferGeometry()
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3))
    trailGeo.setAttribute('aAlpha', new THREE.BufferAttribute(trailAlpha, 1))
    const trailUniforms = {
      uColor: { value: new THREE.Color() },
      uScale: { value: 1 },
      uVisible: { value: 0 },
    }
    const trail = new THREE.Points(
      trailGeo,
      new THREE.ShaderMaterial({
        uniforms: trailUniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          uniform vec3 uColor; uniform float uScale; uniform float uVisible;
          attribute float aAlpha;
          varying vec3 vColor; varying float vAlpha;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = uScale * (0.25 + aAlpha) * (40.0 / -mv.z);
            vColor = uColor;
            vAlpha = aAlpha * aAlpha * 0.75 * uVisible;
          }`,
        fragmentShader: POINT_FRAG,
      }),
    )
    trail.frustumCulled = false
    this.scene.add(trail)

    this.themers.push((pal) => {
      coreMat.color.copy(pal.packet).multiplyScalar(3)
      haloMat.color.copy(pal.packet)
      light.color.copy(pal.packet)
      trailUniforms.uColor.value.copy(pal.packet)
    })

    const body = new Spring3(70, 2 * Math.sqrt(70) * 0.75)
    body.snap(BUTTON)
    const size = new Spring(0, 160, 12)
    const target = new THREE.Vector3()
    let primed = false
    this.updaters.push((f) => {
      PACKET.sample(f.p, target)
      // Idle bob, plus an excited wobble while waiting in the handshake.
      target.y += Math.sin(f.t * 2.2) * 0.08
      if (f.p > 0.38 && f.p < 0.5) target.x += Math.sin(f.t * 5) * 0.05
      body.target.copy(target)
      const pos = body.step(f.dt)
      group.position.copy(pos)

      const alive = f.p > CLICK_P && f.p < 0.665
      size.target = alive ? 1 : 0
      const s = Math.max(0, size.step(f.dt))
      group.scale.setScalar(Math.max(0.0001, s * (1 + Math.sin(f.t * 4) * 0.06)))
      group.visible = s > 0.01
      light.intensity = s * 14
      trailUniforms.uVisible.value = clamp01(s)
      trailUniforms.uScale.value = this.pixelRatio * (this.height / 900) * 4

      if (!primed) {
        for (let i = 0; i < TRAIL; i++) trailPos.set([pos.x, pos.y, pos.z], i * 3)
        primed = true
      }
      trailPos.copyWithin(3, 0, (TRAIL - 1) * 3)
      trailPos.set([pos.x, pos.y, pos.z], 0)
      trailGeo.attributes.position!.needsUpdate = true
    })
  }

  /* Act 2 — a constellation of name servers; the route lights up hop by hop. */
  private buildDns(): void {
    const rand = mulberry32(11)
    const C = v3(-14, 6, -46)
    const N = 170
    const nodes: THREE.Vector3[] = []
    for (let i = 0; i < N; i++) {
      const u = rand() * Math.PI * 2
      const r = Math.cbrt(rand())
      const h = rand() * 2 - 1
      nodes.push(v3(C.x + Math.cos(u) * r * 17, C.y + h * 8, C.z + Math.sin(u) * r * 15))
    }
    const nodeMat = new THREE.MeshStandardMaterial({ roughness: 0.4, emissiveIntensity: 0.35 })
    const nodeMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.13, 1), nodeMat, N)
    const m = new THREE.Matrix4()
    nodes.forEach((p, i) => nodeMesh.setMatrixAt(i, m.makeScale(1, 1, 1).setPosition(p)))
    this.scene.add(nodeMesh)

    // Faint mesh: each node to its two nearest neighbours.
    const edges: number[] = []
    for (const [i, a] of nodes.entries()) {
      const near = nodes
        .map((b, j) => ({ j, d: a.distanceToSquared(b) }))
        .filter((x) => x.j !== i)
        .sort((x, y) => x.d - y.d)
        .slice(0, 2)
      for (const { j } of near) {
        const b = nodes[j]!
        edges.push(a.x, a.y, a.z, b.x, b.y, b.z)
      }
    }
    const edgeGeo = new THREE.BufferGeometry()
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edges, 3))
    const edgeMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false })
    this.scene.add(new THREE.LineSegments(edgeGeo, edgeMat))

    // The resolution route: big hubs + a glowing tube that grows as the packet travels.
    const hubMat = new THREE.MeshStandardMaterial({ roughness: 0.25, emissiveIntensity: 0.5 })
    const hubs = ROUTE.map((p) => {
      const hub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 3), hubMat.clone())
      hub.position.copy(p)
      this.scene.add(hub)
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.75, 0.025, 8, 64),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, toneMapped: false }),
      )
      ring.position.copy(p)
      this.scene.add(ring)
      return { hub, ring }
    })
    const routeCurve = new THREE.CatmullRomCurve3(
      [PACKET.sample(0.18, new THREE.Vector3()), ...ROUTE],
      false,
      'centripetal',
    )
    const TUBULAR = 220
    const RADIAL = 8
    const tubeGeo = new THREE.TubeGeometry(routeCurve, TUBULAR, 0.05, RADIAL, false)
    const tubeMat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.95 })
    const tube = new THREE.Mesh(tubeGeo, tubeMat)
    this.scene.add(tube)
    const indexCount = tubeGeo.index!.count

    const names = ['.  root', '.dev', 'lumen.dev', '203.0.113.7']
    const labels = ROUTE.map((p, i) => {
      const sprite = this.label(names[i]!, { accentIndex: 1, mono: true, height: 0.55 })
      sprite.position.copy(p).add(v3(0, 0.95, 0))
      this.scene.add(sprite)
      return sprite
    })

    this.themers.push((pal) => {
      nodeMat.color.copy(pal.phases[3]!)
      nodeMat.emissive.copy(pal.pastel[3]!)
      edgeMat.color.copy(pal.phases[3]!)
      tubeMat.color.copy(pal.phases[1]!).multiplyScalar(2.4)
      for (const { hub, ring } of hubs) {
        const mat = hub.material as THREE.MeshStandardMaterial
        mat.color.copy(pal.phases[1]!)
        mat.emissive.copy(pal.phases[1]!)
        ;(ring.material as THREE.MeshBasicMaterial).color.copy(pal.phases[1]!)
      }
    })

    const hopAt = [0.205, 0.245, 0.285, 0.325]
    this.updaters.push((f) => {
      const visible = f.p > 0.12 && f.p < 0.5
      nodeMesh.visible = visible
      tube.visible = visible
      const grow = range(f.p, 0.17, 0.33)
      tube.geometry.setDrawRange(0, Math.floor((indexCount * grow) / (RADIAL * 6)) * RADIAL * 6)
      for (const [i, { hub, ring }] of hubs.entries()) {
        const reached = smooth(hopAt[i]! - 0.012, hopAt[i]!, f.p)
        const mat = hub.material as THREE.MeshStandardMaterial
        mat.emissiveIntensity = 0.3 + reached * 1.6
        hub.scale.setScalar(1 + reached * 0.25 + Math.sin(f.t * 3 + i) * 0.03 * reached)
        const pulse = (f.t * 0.7 + i * 0.25) % 1
        ring.scale.setScalar(1 + pulse * 1.4)
        ;(ring.material as THREE.MeshBasicMaterial).opacity = reached * (1 - pulse) * 0.7
        ring.lookAt(this.camera.position)
        const lm = labels[i]!.material
        lm.opacity = reached * (1 - range(f.p, 0.37, 0.42))
      }
    })
  }

  /* Act 3 — SYN / SYN-ACK / ACK, the rings interlock, a padlock forms. */
  private buildHandshake(): void {
    const ringGeo = new THREE.TorusGeometry(1.45, 0.16, 32, 120)
    const clientMat = new THREE.MeshPhysicalMaterial({
      roughness: 0.2,
      clearcoat: 1,
      emissiveIntensity: 0.25,
    })
    const serverMat = clientMat.clone()
    const client = new THREE.Mesh(ringGeo, clientMat)
    const server = new THREE.Mesh(ringGeo, serverMat)
    this.scene.add(client, server)

    const pulseMat = new THREE.MeshBasicMaterial({ toneMapped: false })
    const pulse = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 3), pulseMat)
    const pulseGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glow,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    pulseGlow.scale.setScalar(1.3)
    pulse.add(pulseGlow)
    this.scene.add(pulse)

    const steps = [
      { text: 'SYN', from: -1, a: 0.1, b: 0.28 },
      { text: 'SYN-ACK', from: 1, a: 0.3, b: 0.48 },
      { text: 'ACK', from: -1, a: 0.5, b: 0.64 },
    ]
    const stepLabels = steps.map((s) => {
      const sprite = this.label(s.text, { accentIndex: 2, mono: true, height: 0.5 })
      sprite.position.copy(HAND).add(v3(0, 1.9, 0))
      this.scene.add(sprite)
      return sprite
    })

    // Padlock.
    const lock = new THREE.Group()
    const bodyMat = new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 1, emissiveIntensity: 0.2 })
    const lockBody = new THREE.Mesh(new RoundedBoxGeometry(1.3, 1.05, 0.5, 5, 0.18), bodyMat)
    const shackleMat = new THREE.MeshPhysicalMaterial({ roughness: 0.15, metalness: 0.2, clearcoat: 1 })
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.1, 16, 48, Math.PI), shackleMat)
    shackle.position.y = 0.5
    const keyhole = new THREE.Mesh(
      new THREE.CircleGeometry(0.11, 24),
      new THREE.MeshBasicMaterial({ color: '#6b5fa8', toneMapped: false }),
    )
    keyhole.position.set(0, 0.02, 0.26)
    lock.add(lockBody, shackle, keyhole)
    lock.position.copy(HAND).add(v3(0, 2.9, 0))
    this.scene.add(lock)
    const tlsLabel = this.label('TLS 1.3 · secured', { accentIndex: 3, height: 0.5 })
    tlsLabel.position.copy(HAND).add(v3(0, 4.25, 0))
    this.scene.add(tlsLabel)

    this.themers.push((pal) => {
      clientMat.color.copy(pal.phases[5]!)
      clientMat.emissive.copy(pal.phases[5]!)
      serverMat.color.copy(pal.phases[3]!)
      serverMat.emissive.copy(pal.phases[3]!)
      pulseMat.color.copy(pal.phases[2]!).multiplyScalar(3)
      pulseGlow.material.color.copy(pal.phases[2]!)
      bodyMat.color.copy(pal.pastel[5]!)
      bodyMat.emissive.copy(pal.pastel[5]!)
      shackleMat.color.copy(pal.phases[3]!)
    })

    const lockScale = new Spring(0, 140, 9)
    const shackleDrop = new Spring(0, 120, 10)
    this.updaters.push((f) => {
      const local = range(f.p, 0.36, 0.52)
      const visible = f.p > 0.28 && f.p < 0.62
      client.visible = server.visible = lock.visible = visible
      const join = easeInOutCubic(range(local, 0.64, 0.86))
      client.position.copy(HAND).add(v3(-3 + join * 2.1, Math.sin(f.t * 1.1) * 0.08, 0))
      server.position.copy(HAND).add(v3(3 - join * 2.1, Math.cos(f.t * 1.1) * 0.08, 0))
      server.rotation.y = join * Math.PI * 0.5
      client.rotation.z = f.t * 0.2
      server.rotation.x = Math.sin(f.t * 0.6) * 0.1

      let active = -1
      for (const [i, s] of steps.entries()) {
        const k = range(local, s.a, s.b)
        if (k > 0 && k < 1) {
          active = i
          const x = HAND.x + s.from * 3 * (1 - 2 * easeInOutCubic(k))
          pulse.position.set(x, HAND.y + Math.sin(k * Math.PI) * 1.1, HAND.z)
        }
        stepLabels[i]!.material.opacity =
          smooth(s.a - 0.02, s.a + 0.04, local) * (1 - smooth(s.b, s.b + 0.06, local))
      }
      pulse.visible = active >= 0
      clientMat.emissiveIntensity = 0.25 + (active === 0 || active === 2 ? 0.6 : 0)
      serverMat.emissiveIntensity = 0.25 + (active === 1 ? 0.6 : 0)

      lockScale.target = local > 0.8 && f.p < 0.56 ? 1 : 0
      const ls = Math.max(0.0001, lockScale.step(f.dt))
      lock.scale.setScalar(ls)
      lock.rotation.y = Math.sin(f.t * 0.8) * 0.3
      shackleDrop.target = local > 0.9 ? 1 : 0
      shackle.position.y = 0.75 - shackleDrop.step(f.dt) * 0.25
      tlsLabel.material.opacity = smooth(0.86, 0.94, local) * (1 - range(f.p, 0.54, 0.58))
    })
  }

  /* Act 4 — the server tower thinks. Time slows; the TTFB ring fills. */
  private buildServer(): void {
    const group = new THREE.Group()
    group.position.copy(TOWER)
    this.scene.add(group)
    const SLABS = 9
    const slabGeo = new RoundedBoxGeometry(4, 0.56, 3, 4, 0.14)
    const ledGeo = new THREE.BoxGeometry(2.6, 0.07, 0.04)
    const slabMat = new THREE.MeshPhysicalMaterial({ roughness: 0.35, clearcoat: 0.8, sheen: 0.6 })
    const leds = Array.from({ length: SLABS }, (_, i) => {
      const slab = new THREE.Mesh(slabGeo, slabMat)
      slab.position.y = i * 0.72
      group.add(slab)
      const led = new THREE.Mesh(ledGeo, new THREE.MeshBasicMaterial({ toneMapped: false }))
      led.position.set(-0.3, i * 0.72, 1.52)
      group.add(led)
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.07, 16),
        new THREE.MeshBasicMaterial({ toneMapped: false }),
      )
      dot.position.set(1.55, i * 0.72, 1.515)
      group.add(dot)
      return { led, dot }
    })

    // TTFB clock: a horizontal ring that fills as the wait goes on.
    const arcUniforms = {
      uProgress: { value: 0 },
      uColor: { value: new THREE.Color() },
      uTrack: { value: new THREE.Color() },
    }
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(4.3, 0.07, 12, 220),
      new THREE.ShaderMaterial({
        uniforms: arcUniforms,
        transparent: true,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uProgress; uniform vec3 uColor; uniform vec3 uTrack;
          varying vec2 vUv;
          void main() {
            float on = step(vUv.x, uProgress);
            float head = smoothstep(uProgress - 0.04, uProgress, vUv.x) * on;
            vec3 col = mix(uTrack, uColor * (2.2 + head * 2.0), on);
            gl_FragColor = vec4(col, mix(0.25, 1.0, on));
          }`,
      }),
    )
    arc.rotation.x = Math.PI / 2
    arc.position.y = 2.9
    group.add(arc)

    // Queries orbiting the tower — they slow with time.
    const Q = 36
    const rand = mulberry32(5)
    const qMat = new THREE.MeshStandardMaterial({ roughness: 0.3, emissiveIntensity: 0.6 })
    const queries = new THREE.InstancedMesh(new RoundedBoxGeometry(0.28, 0.28, 0.28, 2, 0.06), qMat, Q)
    const orbits = Array.from({ length: Q }, () => ({
      r: 2.9 + rand() * 2.6,
      y: rand() * 6,
      speed: 0.4 + rand() * 0.8,
      phase: rand() * Math.PI * 2,
      tilt: (rand() - 0.5) * 0.6,
    }))
    group.add(queries)
    const qColor = new THREE.Color()

    const okLabel = this.label('200 OK · TTFB 212 ms', { accentIndex: 5, mono: true, height: 0.55 })
    okLabel.position.set(0, 7.7, 0)
    group.add(okLabel)

    const heartbeat = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 2.75, 96),
      new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    )
    heartbeat.rotation.x = -Math.PI / 2
    heartbeat.position.y = -0.4
    group.add(heartbeat)

    this.themers.push((pal) => {
      slabMat.color.copy(pal.glass).lerp(pal.pastel[0]!, 0.35)
      slabMat.sheenColor.copy(pal.pastel[0]!)
      arcUniforms.uColor.value.copy(pal.phases[5]!)
      arcUniforms.uTrack.value.copy(pal.pastel[0]!)
      qMat.color.copy(pal.phases[5]!)
      qMat.emissive.copy(pal.phases[5]!)
      ;(heartbeat.material as THREE.MeshBasicMaterial).color.copy(pal.phases[5]!)
      for (let i = 0; i < Q; i++) queries.setColorAt(i, qColor.copy(pal.pastel[i % pal.pastel.length]!))
      if (queries.instanceColor) queries.instanceColor.needsUpdate = true
    })

    let orbitTime = 0
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const one = new THREE.Vector3(1, 1, 1)
    const pos = new THREE.Vector3()
    this.updaters.push((f) => {
      group.visible = f.p > 0.45 && f.p < 0.8
      if (!group.visible) return
      const local = range(f.p, 0.52, 0.66)
      orbitTime += f.dt * f.slow
      arcUniforms.uProgress.value = easeInOutCubic(range(local, 0.08, 0.85))

      for (const [i, { led, dot }] of leds.entries()) {
        const scan = Math.sin(orbitTime * 3 - i * 0.7) * 0.5 + 0.5
        const thinking = local > 0.02 && local < 0.9 ? 1 : 0.25
        const ledMat = led.material as THREE.MeshBasicMaterial
        ledMat.color.copy(this.palette.phases[5]!).multiplyScalar(0.8 + scan * 2.6 * thinking)
        ;(dot.material as THREE.MeshBasicMaterial).color
          .copy(i % 3 === 0 ? this.palette.phases[1]! : this.palette.phases[6]!)
          .multiplyScalar(0.7 + (Math.sin(orbitTime * 7 + i * 3) > 0.3 ? 1 : 0) * thinking)
      }
      for (const [i, o] of orbits.entries()) {
        const a = o.phase + orbitTime * o.speed
        pos.set(Math.cos(a) * o.r, o.y + Math.sin(a * 2) * 0.3, Math.sin(a) * o.r)
        pos.applyAxisAngle(THREE.Object3D.DEFAULT_UP, o.tilt)
        q.setFromEuler(e.set(a, a * 0.7, 0))
        queries.setMatrixAt(i, m.compose(pos, q, one.setScalar(0.6 + 0.4 * Math.sin(a * 3) ** 2)))
      }
      queries.instanceMatrix.needsUpdate = true

      const beat = (orbitTime * 0.6) % 1
      heartbeat.scale.setScalar(1 + beat * 1.6)
      ;(heartbeat.material as THREE.MeshBasicMaterial).opacity =
        (1 - beat) * 0.5 * (local > 0 && local < 1 ? 1 : 0.2)
      okLabel.material.opacity = smooth(0.82, 0.92, local) * (1 - range(f.p, 0.7, 0.74))
    })
  }

  /* Act 5 — a river of bytes in phase colours, spiralling from the server to the archive. */
  private buildRiver(): void {
    const curve = new THREE.CatmullRomCurve3(RIVER, false, 'centripetal')
    const SAMPLES = 64
    const path = curve.getSpacedPoints(SAMPLES - 1)
    const count = 5200
    const rand = mulberry32(99)
    const offset = new Float32Array(count)
    const speed = new Float32Array(count)
    const radius = new Float32Array(count)
    const angle = new Float32Array(count)
    const color = new Float32Array(count * 3)
    const phaseIdx = new Uint8Array(count)
    for (let i = 0; i < count; i++) {
      offset[i] = rand()
      speed[i] = 0.6 + rand() * 0.8
      radius[i] = Math.pow(rand(), 0.7) * 0.85
      angle[i] = rand() * Math.PI * 2
      phaseIdx[i] = 1 + Math.floor(rand() * 6)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    geo.setAttribute('aOffset', new THREE.BufferAttribute(offset, 1))
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1))
    geo.setAttribute('aRadius', new THREE.BufferAttribute(radius, 1))
    geo.setAttribute('aAngle', new THREE.BufferAttribute(angle, 1))
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
    const uniforms = {
      uPath: { value: path },
      uTime: { value: 0 },
      uHead: { value: 0 },
      uTail: { value: 0 },
      uScale: { value: 1 },
    }
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        #define SAMPLES ${SAMPLES}
        uniform vec3 uPath[SAMPLES];
        uniform float uTime; uniform float uHead; uniform float uTail; uniform float uScale;
        attribute float aOffset; attribute float aSpeed; attribute float aRadius; attribute float aAngle; attribute vec3 aColor;
        varying vec3 vColor; varying float vAlpha;
        vec3 pathAt(float t) {
          float f = clamp(t, 0.0, 1.0) * float(SAMPLES - 1);
          int i = int(floor(f));
          int j = min(i + 1, SAMPLES - 1);
          return mix(uPath[i], uPath[j], fract(f));
        }
        void main() {
          float t = fract(aOffset + uTime * aSpeed * 0.07);
          vec3 c = pathAt(t);
          vec3 tangent = normalize(pathAt(t + 0.01) - c + vec3(1e-4));
          vec3 n = normalize(cross(tangent, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
          vec3 b = cross(tangent, n);
          float spin = aAngle + uTime * 0.9 * aSpeed + t * 14.0;
          float r = aRadius * (0.75 + 0.25 * sin(uTime * 1.7 + aOffset * 40.0)) * (0.6 + 0.6 * sin(t * 3.14159));
          vec3 p = c + (n * cos(spin) + b * sin(spin)) * r;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(uScale * (0.6 + aSpeed * 0.5) * (22.0 / -mv.z), uScale * 4.0);
          float vis = step(t, uHead) * smoothstep(uHead, uHead - 0.12, t) * step(uTail, t);
          vColor = aColor;
          vAlpha = vis * 0.85 * smoothstep(0.0, 0.04, t);
        }`,
      fragmentShader: POINT_FRAG,
    })
    const points = new THREE.Points(geo, mat)
    points.frustumCulled = false
    this.scene.add(points)

    this.themers.push((pal) => {
      for (let i = 0; i < count; i++) {
        const c = pal.phases[phaseIdx[i]!]!
        color.set([c.r, c.g, c.b], i * 3)
      }
      geo.attributes.aColor!.needsUpdate = true
    })
    this.updaters.push((f) => {
      uniforms.uTime.value = f.t
      uniforms.uHead.value = range(f.p, 0.645, 0.79) * 1.15
      uniforms.uTail.value = range(f.p, 0.82, 0.92) * 1.05
      uniforms.uScale.value = this.pixelRatio * (this.height / 900) * 9
      points.visible = f.p > 0.6 && f.p < 0.95
    })
  }

  /* Act 6 — the sample capture as a 3D waterfall; every bar springs into place. */
  private buildArchive(): void {
    const entries = toEntries(createSampleLog())
      .toSorted((a, b) => a.startTime - b.startTime)
      .slice(0, 28)
    const t0 = entries[0]?.startTime ?? 0
    const end = Math.max(...entries.map((e) => e.startTime - t0 + e.time), 1)
    const WIDTH = 15
    const ROW = 0.31
    const scaleX = WIDTH / end
    const left = ARCHIVE.x - WIDTH / 2
    const top = ARCHIVE.y + (entries.length * ROW) / 2

    interface Seg {
      row: number
      x: number
      w: number
      phase: number
    }
    const segs: Seg[] = []
    for (const [row, e] of entries.entries()) {
      for (const s of phaseSegments(e)) {
        segs.push({
          row,
          x: (e.startTime - t0 + s.offset) * scaleX,
          w: Math.max(0.035, s.duration * scaleX),
          phase: PHASES.findIndex((p) => p.key === s.key),
        })
      }
    }
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.32,
      metalness: 0,
    })
    const bars = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 0.2, 0.22, 2, 0.06), mat, segs.length)
    bars.frustumCulled = false
    this.scene.add(bars)

    // Backplate + grid + DCL / Load markers.
    const plateMat = new THREE.MeshPhysicalMaterial({
      roughness: 0.6,
      clearcoat: 0.5,
      transparent: true,
      opacity: 0.55,
    })
    const plate = new THREE.Mesh(
      new RoundedBoxGeometry(WIDTH + 1.6, entries.length * ROW + 1.4, 0.12, 4, 0.06),
      plateMat,
    )
    plate.position.copy(ARCHIVE).add(v3(0, 0, -0.35))
    this.scene.add(plate)
    const grid: number[] = []
    for (let i = 0; i <= 10; i++) {
      const x = left + (WIDTH * i) / 10
      grid.push(x, top + 0.3, ARCHIVE.z - 0.25, x, top - entries.length * ROW - 0.2, ARCHIVE.z - 0.25)
    }
    const gridGeo = new THREE.BufferGeometry()
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3))
    const gridMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.35 })
    this.scene.add(new THREE.LineSegments(gridGeo, gridMat))

    const sweep = new THREE.Mesh(
      new THREE.PlaneGeometry(0.05, entries.length * ROW + 0.8),
      new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true }),
    )
    sweep.position.set(left, ARCHIVE.y, ARCHIVE.z + 0.2)
    this.scene.add(sweep)

    const title = this.label(`capture.har  ·  ${entries.length} requests`, { accentIndex: 2, height: 0.62 })
    title.position.copy(ARCHIVE).add(v3(-WIDTH / 2 + 2.6, entries.length * ROW * 0.5 + 1.25, 0))
    this.scene.add(title)

    const springs = entries.map(() => new Spring(0, 150 + Math.random() * 40, 11))
    this.themers.push((pal) => {
      const c = new THREE.Color()
      for (const [i, s] of segs.entries()) bars.setColorAt(i, c.copy(pal.phases[s.phase] ?? pal.phases[0]!))
      if (bars.instanceColor) bars.instanceColor.needsUpdate = true
      plateMat.color.copy(pal.glass)
      gridMat.color.copy(pal.phases[3]!)
      ;(sweep.material as THREE.MeshBasicMaterial).color.copy(pal.packet).multiplyScalar(2.6)
    })

    const m = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()
    const q = new THREE.Quaternion()
    this.updaters.push((f) => {
      const visible = f.p > 0.72
      bars.visible = plate.visible = visible
      if (!visible) return
      const local = range(f.p, 0.78, 0.9)
      for (const [row, spring] of springs.entries()) {
        const k = row / entries.length
        spring.target = smooth(k * 0.55, k * 0.55 + 0.3, local)
        spring.step(f.dt)
      }
      for (const [i, s] of segs.entries()) {
        const v = springs[s.row]!.value
        const grow = Math.max(0.0001, v)
        const y = top - s.row * ROW + (1 - Math.min(1, v)) * 2.2
        pos.set(
          left + s.x * Math.min(1.08, grow) + (s.w * grow) / 2,
          y,
          ARCHIVE.z + (1 - Math.min(1, v)) * 1.5,
        )
        scl.set(s.w * grow, Math.min(1.15, 0.2 + v * 0.8), 1)
        bars.setMatrixAt(i, m.compose(pos, q, scl))
      }
      bars.instanceMatrix.needsUpdate = true
      const sw = (f.t * 0.12) % 1
      sweep.position.x = left + sw * WIDTH
      ;(sweep.material as THREE.MeshBasicMaterial).opacity = local > 0.95 ? Math.sin(sw * Math.PI) * 0.8 : 0
      plateMat.opacity = 0.55 * smooth(0, 0.25, local)
      title.material.opacity = smooth(0.15, 0.4, local)
    })
  }

  /* Act 7 — an iridescent portal; the DOM drop zone sits in its eye. */
  private buildPortal(): void {
    const group = new THREE.Group()
    group.position.copy(PORTAL)
    this.scene.add(group)
    const uniforms = {
      uTime: { value: 0 },
      uA: { value: new THREE.Color() },
      uB: { value: new THREE.Color() },
      uC: { value: new THREE.Color() },
      uOpen: { value: 0 },
      uGain: { value: 2.6 },
    }
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(5.6, 0.22, 48, 256),
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform float uGain;
          varying vec2 vUv;
          void main() {
            float t = fract(vUv.x + uTime * 0.05);
            vec3 col = t < 0.33 ? mix(uA, uB, t * 3.0) : t < 0.66 ? mix(uB, uC, (t - 0.33) * 3.0) : mix(uC, uA, (t - 0.66) * 3.0);
            gl_FragColor = vec4(col * uGain, 1.0);
          }`,
      }),
    )
    group.add(ring)
    const eye = new THREE.Mesh(
      new THREE.CircleGeometry(5.4, 96),
      new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform float uOpen;
          varying vec2 vUv;
          void main() {
            vec2 p = vUv - 0.5;
            float r = length(p) * 2.0;
            float a = atan(p.y, p.x);
            float swirl = sin(a * 3.0 + r * 9.0 - uTime * 0.8) * 0.5 + 0.5;
            vec3 col = mix(mix(uA, uB, swirl), uC, smoothstep(0.2, 1.0, r));
            float alpha = smoothstep(1.0, 0.55, r) * 0.55 * uOpen;
            gl_FragColor = vec4(col, alpha);
          }`,
      }),
    )
    eye.position.z = -0.05
    group.add(eye)

    const count = 1400
    const rand = mulberry32(3)
    const pos = new Float32Array(count * 3)
    const color = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2
      const r = 5.6 + (rand() - 0.5) * 2.4
      pos.set([Math.cos(a) * r, Math.sin(a) * r, (rand() - 0.5) * 1.6], i * 3)
      seed[i] = rand()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    const pUniforms = { uTime: { value: 0 }, uScale: { value: 1 }, uOpen: { value: 0 } }
    const motes = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: pUniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          uniform float uTime; uniform float uScale; uniform float uOpen;
          attribute vec3 aColor; attribute float aSeed;
          varying vec3 vColor; varying float vAlpha;
          void main() {
            float a = uTime * (0.15 + aSeed * 0.25);
            float c = cos(a), s = sin(a);
            vec3 p = vec3(c * position.x - s * position.y, s * position.x + c * position.y, position.z);
            p.z += sin(uTime + aSeed * 20.0) * 0.3;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = min(uScale * (0.5 + aSeed) * (20.0 / -mv.z), uScale * 5.0);
            vColor = aColor;
            vAlpha = 0.8 * uOpen;
          }`,
        fragmentShader: POINT_FRAG,
      }),
    )
    group.add(motes)

    this.themers.push((pal) => {
      uniforms.uGain.value = pal === PALETTES.dark ? 1.35 : 2.6
      uniforms.uA.value.copy(pal.pastel[0]!)
      uniforms.uB.value.copy(pal.pastel[1]!)
      uniforms.uC.value.copy(pal.pastel[2]!)
      for (let i = 0; i < count; i++) {
        const c = pal.pastel[i % pal.pastel.length]!
        color.set([c.r, c.g, c.b], i * 3)
      }
      geo.attributes.aColor!.needsUpdate = true
    })
    const open = new Spring(0, 60, 12)
    this.updaters.push((f) => {
      group.visible = f.p > 0.85
      if (!group.visible) return
      open.target = smooth(0.9, 1, f.p)
      const o = Math.max(0.0001, open.step(f.dt))
      uniforms.uTime.value = f.t
      uniforms.uOpen.value = clamp01(o)
      pUniforms.uTime.value = f.t
      pUniforms.uOpen.value = clamp01(o)
      pUniforms.uScale.value = this.pixelRatio * (this.height / 900) * 8
      group.scale.setScalar(0.4 + o * 0.6)
      group.rotation.z = f.t * 0.05
      group.lookAt(this.camera.position)
    })
  }
}

/* ─── Physics: pooled particles with gravity, drag and a bouncy floor ─── */

class Physics {
  private readonly mesh: THREE.InstancedMesh
  private readonly n = 900
  private readonly pos: Float32Array
  private readonly vel: Float32Array
  private readonly life: Float32Array
  private readonly maxLife: Float32Array
  private readonly spin: Float32Array
  private readonly floorOn: Uint8Array
  private next = 0
  private alive = 0
  private readonly palette: Palette
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly e = new THREE.Euler()
  private readonly p = new THREE.Vector3()
  private readonly s = new THREE.Vector3()

  constructor(scene: THREE.Scene, palette: Palette) {
    this.palette = palette
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.3,
      emissive: '#ffffff',
      emissiveIntensity: 0.25,
    })
    this.mesh = new THREE.InstancedMesh(new RoundedBoxGeometry(0.16, 0.16, 0.16, 2, 0.05), mat, this.n)
    this.mesh.frustumCulled = false
    this.pos = new Float32Array(this.n * 3)
    this.vel = new Float32Array(this.n * 3)
    this.life = new Float32Array(this.n)
    this.maxLife = new Float32Array(this.n)
    this.spin = new Float32Array(this.n)
    this.floorOn = new Uint8Array(this.n)
    const c = new THREE.Color()
    for (let i = 0; i < this.n; i++) {
      this.mesh.setColorAt(i, c.copy(palette.pastel[i % palette.pastel.length]!))
      this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0))
    }
    scene.add(this.mesh)
  }

  private spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    floor: boolean,
  ) {
    const i = this.next
    this.next = (this.next + 1) % this.n
    this.pos.set([x, y, z], i * 3)
    this.vel.set([vx, vy, vz], i * 3)
    this.life[i] = life
    this.maxLife[i] = life
    this.spin[i] = (Math.random() - 0.5) * 8
    this.floorOn[i] = floor ? 1 : 0
    this.alive = Math.max(this.alive, 1)
  }

  burst(origin: THREE.Vector3, count: number) {
    for (let k = 0; k < count; k++) {
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      const sp = 2 + Math.random() * 3.5
      this.spawn(
        origin.x,
        origin.y,
        origin.z,
        Math.sin(ph) * Math.cos(th) * sp,
        Math.abs(Math.cos(ph)) * sp + 2.5,
        Math.sin(ph) * Math.sin(th) * sp,
        2 + Math.random() * 1.2,
        false,
      )
    }
  }

  storm(center: THREE.Vector3, count: number) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * 9
      this.spawn(
        center.x + Math.cos(a) * r,
        center.y + 7 + Math.random() * 9,
        center.z + Math.sin(a) * r,
        (Math.random() - 0.5) * 1.5,
        -Math.random() * 2,
        (Math.random() - 0.5) * 1.5,
        4 + Math.random() * 2.5,
        true,
      )
    }
  }

  step(dt: number, floorY: number) {
    if (!this.alive) return
    const G = -9.81 * 0.55
    const DRAG = 0.45
    let any = false
    for (let i = 0; i < this.n; i++) {
      if (this.life[i]! <= 0) continue
      any = true
      this.life[i]! -= dt
      const j = i * 3
      const drag = Math.exp(-DRAG * dt)
      this.vel[j]! *= drag
      this.vel[j + 2]! *= drag
      this.vel[j + 1] = this.vel[j + 1]! * drag + G * dt
      this.pos[j]! += this.vel[j]! * dt
      this.pos[j + 1]! += this.vel[j + 1]! * dt
      this.pos[j + 2]! += this.vel[j + 2]! * dt
      if (this.floorOn[i] && this.pos[j + 1]! < floorY) {
        this.pos[j + 1] = floorY
        this.vel[j + 1] = -this.vel[j + 1]! * 0.55
        this.vel[j]! *= 0.8
        this.vel[j + 2]! *= 0.8
        this.spin[i]! *= 0.7
      }
      const lifeK = this.life[i]! / this.maxLife[i]!
      const size = lifeK <= 0 ? 0 : Math.min(1, lifeK * 4) * (0.7 + 0.3 * lifeK)
      const age = this.maxLife[i]! - this.life[i]!
      this.q.setFromEuler(this.e.set(age * this.spin[i]!, age * this.spin[i]! * 0.7, 0))
      this.p.set(this.pos[j]!, this.pos[j + 1]!, this.pos[j + 2]!)
      this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s.setScalar(size)))
    }
    this.mesh.instanceMatrix.needsUpdate = true
    if (!any) this.alive = 0
    void this.palette
  }

  dispose() {
    this.mesh.dispose()
  }
}
