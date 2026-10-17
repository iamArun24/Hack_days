import { useEffect, useRef } from 'react'
import { useMediaQuery } from '@/hooks/use-media-query'

/**
 * A soft two-part cursor: a dot that tracks the pointer exactly and a ring that follows it on
 * a spring. Elements opt in to richer states with `data-cursor="hover"` or a text label
 * (`data-cursor="Open"`), which morphs the ring into a pill.
 */
export function Cursor() {
  const fine = useMediaQuery('(pointer: fine)')
  const dot = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!fine) return
    const target = { x: innerWidth / 2, y: innerHeight / 2 }
    const pos = { ...target }
    const vel = { x: 0, y: 0 }
    const size = { v: 34, vel: 0, target: 34 }
    let pressed = false
    let visible = false
    let raf = 0
    let last = performance.now()

    const onMove = (e: PointerEvent) => {
      target.x = e.clientX
      target.y = e.clientY
      if (!visible) {
        visible = true
        pos.x = target.x
        pos.y = target.y
        dot.current?.style.setProperty('opacity', '1')
        ring.current?.style.setProperty('opacity', '1')
      }
      const el = (e.target as Element | null)?.closest<HTMLElement>('[data-cursor], a, button, input, label')
      const mode = el?.dataset.cursor ?? (el ? 'hover' : '')
      const r = ring.current
      if (!r) return
      if (mode && mode !== 'hover') {
        if (label.current) label.current.textContent = mode
        r.dataset.state = 'label'
        size.target = 76
      } else if (mode === 'hover') {
        r.dataset.state = 'hover'
        size.target = 58
      } else {
        r.dataset.state = ''
        size.target = 34
      }
    }
    const onDown = () => (pressed = true)
    const onUp = () => (pressed = false)
    const onLeave = () => {
      visible = false
      dot.current?.style.setProperty('opacity', '0')
      ring.current?.style.setProperty('opacity', '0')
    }

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now
      // Slightly underdamped spring: the ring trails, then settles with a tiny overshoot.
      const k = 260
      const c = 26
      vel.x += ((target.x - pos.x) * k - vel.x * c) * dt
      vel.y += ((target.y - pos.y) * k - vel.y * c) * dt
      pos.x += vel.x * dt
      pos.y += vel.y * dt
      const want = size.target * (pressed ? 0.78 : 1)
      size.vel += ((want - size.v) * 300 - size.vel * 24) * dt
      size.v += size.vel * dt
      const speed = Math.min(1, Math.hypot(vel.x, vel.y) / 2400)
      const angle = Math.atan2(vel.y, vel.x)
      if (dot.current)
        dot.current.style.transform = `translate3d(${target.x}px, ${target.y}px, 0) translate(-50%, -50%)`
      if (ring.current) {
        const isLabel = ring.current.dataset.state === 'label'
        const stretch = isLabel ? 1 : 1 + speed * 0.35
        ring.current.style.width = ring.current.style.height = `${size.v}px`
        ring.current.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%) rotate(${angle}rad) scale(${stretch}, ${1 / stretch}) rotate(${-angle}rad)`
      }
    }

    addEventListener('pointermove', onMove, { passive: true })
    addEventListener('pointerdown', onDown)
    addEventListener('pointerup', onUp)
    document.documentElement.addEventListener('pointerleave', onLeave)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerdown', onDown)
      removeEventListener('pointerup', onUp)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [fine])

  if (!fine) return null
  return (
    <>
      <div
        ref={ring}
        aria-hidden
        className="group/cursor pointer-events-none fixed top-0 left-0 z-[100] grid place-items-center rounded-full border border-primary/45 opacity-0 backdrop-blur-[1.5px] transition-[opacity,background-color,border-color] duration-300 data-[state=hover]:border-primary/30 data-[state=hover]:bg-lavender/25 data-[state=label]:border-transparent data-[state=label]:bg-primary/85"
      >
        <span
          ref={label}
          className="text-[11px] font-semibold tracking-wide whitespace-nowrap text-primary-foreground opacity-0 transition-opacity duration-200 group-data-[state=label]/cursor:opacity-100"
        />
      </div>
      <div
        ref={dot}
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-[101] size-1.5 rounded-full bg-primary opacity-0 transition-opacity duration-300"
      />
    </>
  )
}
