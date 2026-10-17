import { toast } from 'sonner'
import { create } from 'zustand'
import {
  AiError,
  AUTOPILOT_STAGES,
  aiReady,
  runAutopilot,
  useAiSettings,
  type AutopilotResult,
  type AutopilotStage,
  type DiagnoseRunner,
  type DiagnosisEvent,
  type DiagnosisReport,
} from '@/ai'
import type { Entry } from '@/har/types'
import { useAppStore } from '@/store'
import type { ViewId } from '@/store/ui-slice'
import {
  AGENT_KEYS,
  cancelDiagnosis,
  captureKeyOf,
  startDiagnosis,
  useDoctorStore,
  type AgentKey,
  type AgentState,
} from '../ai-doctor/doctor-store'

export type AutopilotStatus = 'idle' | 'running' | 'done' | 'failed'

interface AutopilotState {
  status: AutopilotStatus
  /** "fileName:count" of the capture the run belongs to — a restored session never re-runs it. */
  captureKey: string | null
  stages: AutopilotStage[]
  result: AutopilotResult | null
  /** The full-screen analysis screen is showing (instead of the app). */
  foreground: boolean
  startedAt: number | null
  finishedAt: number | null
  error: string | null
}

const freshStages = (): AutopilotStage[] =>
  AUTOPILOT_STAGES.map((s) => ({ ...s, state: 'pending', detail: null }))

export const useAutopilotStore = create<AutopilotState>()(() => ({
  status: 'idle',
  captureKey: null,
  stages: freshStages(),
  result: null,
  foreground: false,
  startedAt: null,
  finishedAt: null,
  error: null,
}))

const DOCTOR_VIEW = 'doctor' as ViewId
let controller: AbortController | null = null

/**
 * Runs the diagnosis through the AI Doctor store (so its view shows the very same run) and turns
 * that store's agent updates back into the event stream the pipeline expects.
 */
const doctorRunner: DiagnoseRunner = (entries, captureKey, onEvent, signal) =>
  new Promise<DiagnosisReport>((resolve, reject) => {
    const emit = (agent: AgentKey, state: AgentState) => {
      const { stage, model, keyIndex, ms, tokens, error } = state
      const event: DiagnosisEvent = { type: 'agent', agent, stage, model, keyIndex, ms, tokens, error }
      onEvent(event)
    }
    let previous = useDoctorStore.getState().agents
    const unsubscribe = useDoctorStore.subscribe((s) => {
      for (const key of AGENT_KEYS) if (s.agents[key] !== previous[key]) emit(key, s.agents[key])
      previous = s.agents
    })
    const onAbort = () => {
      unsubscribe()
      reject(new AiError('aborted', 'Autopilot cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    void startDiagnosis(entries, captureKey).finally(() => {
      signal?.removeEventListener('abort', onAbort)
      unsubscribe()
      const { report, error } = useDoctorStore.getState()
      if (report) resolve(report)
      else
        reject(
          new AiError(
            error?.code === 'unknown' || !error ? 'network' : error.code,
            error?.message ?? 'No report',
          ),
        )
    })
  })

/**
 * Starts the agent pipeline for the capture that is open right now. Returns false (and does
 * nothing) when AI isn't set up, autopilot is off, or this exact capture was already analysed.
 */
export function startAutopilot({ force = false } = {}): boolean {
  const { entries, fileName } = useAppStore.getState()
  if (!entries.length || !aiReady() || !useAiSettings.getState().autopilot) return false
  const captureKey = captureKeyOf(fileName, entries.length)
  const current = useAutopilotStore.getState()
  if (!force && current.captureKey === captureKey && current.status !== 'idle' && current.status !== 'failed')
    return false

  controller?.abort()
  const own = new AbortController()
  controller = own
  useAutopilotStore.setState({
    status: 'running',
    captureKey,
    stages: freshStages(),
    result: null,
    foreground: true,
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
  })
  void run(entries, captureKey, own)
  return true
}

async function run(entries: readonly Entry[], captureKey: string, own: AbortController) {
  try {
    const result = await runAutopilot(
      entries,
      captureKey,
      (event) => {
        if (controller !== own || event.type !== 'stage') return
        useAutopilotStore.setState((s) => ({
          stages: s.stages.map((stage) => (stage.id === event.stage.id ? event.stage : stage)),
        }))
      },
      own.signal,
      { diagnose: doctorRunner },
    )
    if (controller !== own) return
    const stages = useAutopilotStore.getState().stages
    const anyDone = stages.some((s) => s.state === 'done')
    const wasForeground = useAutopilotStore.getState().foreground
    useAutopilotStore.setState({
      status: anyDone ? 'done' : 'failed',
      result,
      foreground: false,
      finishedAt: Date.now(),
      error: anyDone ? null : (stages.find((s) => s.state === 'failed')?.detail ?? 'Every AI stage failed'),
    })
    const store = useAppStore.getState()
    if (wasForeground) store.setView(DOCTOR_VIEW)
    else if (anyDone)
      toast.success('AI analysis is ready', {
        description: 'Diagnosis, explained requests and suggested views.',
        action: { label: 'Open', onClick: () => useAppStore.getState().setView(DOCTOR_VIEW) },
      })
    if (!anyDone)
      toast.error('AI analysis failed', { description: useAutopilotStore.getState().error ?? undefined })
  } catch (error) {
    if (controller !== own) return
    const aborted = own.signal.aborted || (error instanceof AiError && error.code === 'aborted')
    useAutopilotStore.setState({
      status: aborted ? 'idle' : 'failed',
      foreground: false,
      finishedAt: Date.now(),
      error: aborted ? null : error instanceof Error ? error.message : String(error),
    })
  } finally {
    if (controller === own) controller = null
  }
}

/** Shows the app while the agents keep working; a pill tracks progress. */
export function sendToBackground(): void {
  useAutopilotStore.setState({ foreground: false })
}

export function cancelAutopilot(): void {
  controller?.abort()
  controller = null
  if (useDoctorStore.getState().running) cancelDiagnosis()
  useAutopilotStore.setState({
    status: 'idle',
    foreground: false,
    stages: freshStages(),
    finishedAt: Date.now(),
  })
}
