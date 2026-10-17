import type { Grade } from '@/har/security'

/** Pastel stroke + ink per grade. Tones stay soft; the letter always carries the meaning. */
export const GRADE_TONE: Record<Grade, { stroke: string; text: string; bg: string; label: string }> = {
  A: { stroke: 'var(--color-sage)', text: 'text-success', bg: 'bg-sage/25', label: 'Excellent' },
  B: { stroke: 'var(--color-sky)', text: 'text-info', bg: 'bg-sky/25', label: 'Good' },
  C: { stroke: 'var(--color-butter)', text: 'text-warning', bg: 'bg-butter/30', label: 'Fair' },
  D: { stroke: 'var(--color-peach)', text: 'text-warning', bg: 'bg-peach/30', label: 'Weak' },
  F: { stroke: 'var(--color-blush)', text: 'text-danger', bg: 'bg-blush/30', label: 'Poor' },
}
