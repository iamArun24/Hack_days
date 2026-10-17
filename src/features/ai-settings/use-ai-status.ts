import { useAiSettings } from '@/ai'

export type AiStatus = 'ready' | 'consent' | 'none'

/** Live readiness for badges: keys + consent → ready; keys only → needs consent; else none. */
export function useAiStatus(): { status: AiStatus; keys: number } {
  const keys = useAiSettings((s) => s.keys.length)
  const consent = useAiSettings((s) => s.consent)
  return { status: !keys ? 'none' : consent ? 'ready' : 'consent', keys }
}

/** Autopilot (analyse every new upload automatically); on by default. */
export function useAutopilot(): [boolean, (on: boolean) => void] {
  const on = useAiSettings((s) => s.autopilot)
  const setAutopilot = useAiSettings((s) => s.setAutopilot)
  return [on, setAutopilot]
}

export const STATUS_DOT: Record<AiStatus, string> = {
  ready: 'bg-success',
  consent: 'bg-warning',
  none: 'bg-subtle-foreground/50',
}
