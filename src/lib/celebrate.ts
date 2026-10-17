/**
 * Lightweight confetti: a throwaway full-screen 2D canvas with simple physics
 * (gravity, quadratic drag, spin, flutter). Removes itself when every piece settles.
 */
const PALETTE = ['#b9b2e8', '#f4c3ac', '#a8d4bd', '#a9cce3', '#efb8c6', '#f2df9e', '#9b8de0']

interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  spin: number
  w: number
  h: number
  color: string
  life: number
  flutter: number
  shape: 'rect' | 'dot'
}

export interface CelebrateOptions {
  /** Viewport coordinates of the burst origin (defaults to upper middle). */
  x?: number
  y?: number
  count?: number
  spread?: number
}

export function celebrate({ x, y, count = 140, spread = 1 }: CelebrateOptions = {}): void {
  if (typeof window === 'undefined') return
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: '100',
  })
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas.remove()
  ctx.scale(dpr, dpr)

  const ox = x ?? window.innerWidth / 2
  const oy = y ?? window.innerHeight * 0.35
  const pieces: Piece[] = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1 * spread
    const speed = 420 + Math.random() * 620
    return {
      x: ox,
      y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 14,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 8,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)]!,
      life: 2.6 + Math.random() * 1.6,
      flutter: Math.random() * Math.PI * 2,
      shape: Math.random() < 0.25 ? 'dot' : 'rect',
    }
  })

  const GRAVITY = 980
  const DRAG = 0.0018
  let last = performance.now()

  const frame = (now: number) => {
    const dt = Math.min(0.033, (now - last) / 1000)
    last = now
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    let alive = 0
    for (const p of pieces) {
      p.life -= dt
      if (p.life <= 0) continue
      alive++
      const speed = Math.hypot(p.vx, p.vy)
      p.vx -= p.vx * speed * DRAG * dt
      p.vy -= p.vy * speed * DRAG * dt
      p.vy += GRAVITY * dt * 0.55
      p.flutter += dt * 8
      p.x += (p.vx + Math.sin(p.flutter) * 40) * dt
      p.y += p.vy * dt
      p.rot += p.spin * dt
      ctx.save()
      ctx.globalAlpha = Math.min(1, p.life / 0.6)
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      if (p.shape === 'dot') {
        ctx.beginPath()
        ctx.arc(0, 0, p.w / 2.2, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // Scale Y by the flutter to fake a 3D tumble.
        ctx.scale(1, Math.cos(p.flutter))
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      }
      ctx.restore()
    }
    if (alive) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}
