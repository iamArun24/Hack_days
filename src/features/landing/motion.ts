import { useEffect, type RefObject } from 'react'

/** Pulls an element toward the pointer while it is within `radius`, springing back on leave. */
export function useMagnetic(ref: RefObject<HTMLElement | null>, strength = 0.35, radius = 110) {
  useEffect(() => {
    const el = ref.current
    if (!el || !matchMedia('(pointer: fine)').matches) return
    el.style.transition = 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)'
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const dx = e.clientX - (r.left + r.width / 2)
      const dy = e.clientY - (r.top + r.height / 2)
      const near = Math.hypot(dx, dy) < radius + Math.max(r.width, r.height) / 2
      el.style.transform = near ? `translate3d(${dx * strength}px, ${dy * strength}px, 0)` : ''
    }
    addEventListener('pointermove', onMove, { passive: true })
    return () => removeEventListener('pointermove', onMove)
  }, [ref, strength, radius])
}

/** Tilts a card in 3D toward the pointer and moves a sheen highlight across it. */
export function useTilt(ref: RefObject<HTMLElement | null>, max = 9) {
  useEffect(() => {
    const el = ref.current
    if (!el || !matchMedia('(pointer: fine)').matches) return
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5
      const y = (e.clientY - r.top) / r.height - 0.5
      el.style.transform = `perspective(1100px) rotateX(${-y * max}deg) rotateY(${x * max}deg) translateZ(0)`
      el.style.setProperty('--sheen-x', `${(x + 0.5) * 100}%`)
      el.style.setProperty('--sheen-y', `${(y + 0.5) * 100}%`)
    }
    const onLeave = () => {
      el.style.transform = ''
    }
    el.style.transition = 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)'
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [ref, max])
}

const KONAMI = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
]

/** ↑↑↓↓←→←→BA */
export function useKonamiCode(onUnlock: () => void) {
  useEffect(() => {
    let i = 0
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      i = key === KONAMI[i] ? i + 1 : key === KONAMI[0] ? 1 : 0
      if (i === KONAMI.length) {
        i = 0
        onUnlock()
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onUnlock])
}
