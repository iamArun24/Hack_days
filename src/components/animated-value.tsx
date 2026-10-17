import { useLayoutEffect, useRef, type ReactNode } from 'react'

const NUMBER = /^([^\d−-]*)([−-]?[\d,]*\.?\d+)(.*)$/s

interface Parts {
  prefix: string
  value: number
  decimals: number
  grouped: boolean
  suffix: string
}

/** Splits "1,234.5 KB" into a number we can tween and the text around it. */
function parseNumeric(text: string): Parts | null {
  const m = NUMBER.exec(text)
  if (!m) return null
  const [, prefix = '', raw = '', suffix = ''] = m
  const clean = raw.replace(/,/g, '').replace('−', '-')
  const value = Number(clean)
  if (!Number.isFinite(value)) return null
  return { prefix, value, decimals: clean.split('.')[1]?.length ?? 0, grouped: raw.includes(','), suffix }
}

const format = (n: number, p: Parts) =>
  p.grouped
    ? n.toLocaleString(undefined, { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals })
    : n.toFixed(p.decimals)

/**
 * Counts up to the numeric part of a formatted value; non-numeric nodes render as-is.
 * The effect owns the span's text and tweens it directly, so React never re-renders per frame.
 */
export function AnimatedValue({ value, duration = 900 }: { value: ReactNode; duration?: number }) {
  const text = typeof value === 'string' ? value : null
  const parts = text === null ? null : parseNumeric(text)
  const node = useRef<HTMLSpanElement>(null)
  const from = useRef(0)

  useLayoutEffect(() => {
    const el = node.current
    const p = text === null ? null : parseNumeric(text)
    if (!el || !p) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = p.value
      el.textContent = text
      return
    }
    const start = performance.now()
    const origin = from.current
    el.textContent = `${p.prefix}${format(origin, p)}${p.suffix}`
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const current = origin + (p.value - origin) * (1 - (1 - t) ** 4)
      from.current = current
      el.textContent = t < 1 ? `${p.prefix}${format(current, p)}${p.suffix}` : text
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [text, duration])

  if (!parts) return <>{value}</>
  return <span ref={node} role="text" aria-label={text ?? undefined} />
}
