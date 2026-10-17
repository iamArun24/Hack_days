import { useEffect, useState } from 'react'
import type { Grade } from '@/har/security'
import { cn } from '@/lib/cn'
import { GRADE_TONE } from './grade-tone'

/** Radial gauge; the ring sweeps from empty to the score on mount (CSS transition on dashoffset). */
export function ScoreGauge({
  score,
  grade,
  size = 168,
  caption,
  className,
}: {
  score: number
  grade: Grade
  size?: number
  caption?: string
  className?: string
}) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(score))
    return () => cancelAnimationFrame(id)
  }, [score])

  const stroke = Math.max(8, size / 14)
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const tone = GRADE_TONE[grade]

  return (
    <div
      className={cn('relative grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Score ${score} of 100, grade ${grade}`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-chart-grid)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone.stroke}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown / 100)}
          style={{ transition: 'stroke-dashoffset 1.6s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn('font-display leading-none font-semibold', tone.text)}
          style={{ fontSize: size * 0.36 }}
        >
          {grade}
        </span>
        <span className="mt-1 text-xs text-muted-foreground tabular">
          {score}
          <span className="text-subtle-foreground"> / 100</span>
        </span>
        {caption && <span className="mt-0.5 text-2xs text-subtle-foreground">{caption}</span>}
      </div>
    </div>
  )
}
