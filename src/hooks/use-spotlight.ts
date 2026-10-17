import { useEffect } from 'react'

/**
 * One document-level listener drives every `.spotlight` surface: the hovered card gets
 * pointer-relative --spot-x/--spot-y and --spot-o = 1; the previous one fades out.
 */
export function useSpotlight(): void {
  useEffect(() => {
    if (!matchMedia('(pointer: fine)').matches) return
    let active: HTMLElement | null = null
    let frame = 0
    let event: PointerEvent | null = null

    const apply = () => {
      frame = 0
      if (!event) return
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('.spotlight') : null
      if (active && active !== target) active.style.setProperty('--spot-o', '0')
      active = target
      if (!target) return
      const rect = target.getBoundingClientRect()
      target.style.setProperty('--spot-x', `${event.clientX - rect.left}px`)
      target.style.setProperty('--spot-y', `${event.clientY - rect.top}px`)
      target.style.setProperty('--spot-o', '1')
    }
    const onMove = (e: PointerEvent) => {
      event = e
      if (!frame) frame = requestAnimationFrame(apply)
    }
    const onLeave = () => {
      active?.style.setProperty('--spot-o', '0')
      active = null
    }

    document.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [])
}
