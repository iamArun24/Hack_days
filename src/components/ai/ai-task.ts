import { useEffect, useRef, useState } from 'react'
import { AiError, useAiSettings } from '@/ai'

/** Asks the settings dialog (owned by the shell) to open. */
export const openAiSettings = () => window.dispatchEvent(new CustomEvent('har:open-ai-settings'))

/** True once at least one key is set and the user has consented to sending redacted data. */
export const useAiReady = () => useAiSettings((s) => s.consent && s.keys.some((k) => k.trim()))

const MESSAGES: Record<AiError['code'], string> = {
  'no-keys': 'Add a Groq API key in AI settings to use this.',
  'invalid-key': 'A Groq key was rejected. Check your keys in AI settings.',
  'rate-limited': 'All keys are rate-limited right now. Wait a few seconds or add another key.',
  network: 'Could not reach Groq. Check your connection and try again.',
  'bad-output': 'The model returned something unusable. Try again.',
  aborted: 'Cancelled.',
  consent: 'Allow sending redacted capture data in AI settings first.',
}

export function aiErrorMessage(error: unknown): string {
  if (error instanceof AiError) return MESSAGES[error.code] ?? error.message
  return error instanceof Error ? error.message : String(error)
}

export type TaskState<T> =
  | { status: 'idle' }
  | { status: 'running'; startedAt: number }
  | { status: 'done'; data: T; ms: number }
  | { status: 'error'; message: string; code: AiError['code'] | null }

/**
 * Runs one AI call at a time with cancellation. Results can be seeded from a cache so
 * revisiting the same subject shows the previous answer instantly.
 */
export function useAiTask<T>(initial?: { data: T; ms: number }) {
  const [state, setState] = useState<TaskState<T>>(
    initial ? { status: 'done', data: initial.data, ms: initial.ms } : { status: 'idle' },
  )
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  const run = async (task: (signal: AbortSignal) => Promise<T>): Promise<T | null> => {
    controller.current?.abort()
    const ctrl = new AbortController()
    controller.current = ctrl
    const startedAt = performance.now()
    setState({ status: 'running', startedAt })
    try {
      const data = await task(ctrl.signal)
      if (ctrl.signal.aborted) return null
      const ms = performance.now() - startedAt
      setState({ status: 'done', data, ms })
      return data
    } catch (error) {
      if (ctrl.signal.aborted) return null
      setState({
        status: 'error',
        message: aiErrorMessage(error),
        code: error instanceof AiError ? error.code : null,
      })
      return null
    }
  }

  const cancel = () => {
    controller.current?.abort()
    setState({ status: 'idle' })
  }
  const reset = () => setState({ status: 'idle' })

  return { state, run, cancel, reset }
}
