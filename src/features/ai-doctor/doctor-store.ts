import { create } from 'zustand'
import { AiError, runDiagnosis, type AgentStage, type DiagnosisReport, type SpecialistId } from '@/ai'
import type { Entry } from '@/har/types'

export type AgentKey = SpecialistId | 'lead'

export interface AgentState {
  stage: AgentStage
  model?: string
  keyIndex?: number
  ms?: number
  tokens?: number
  error?: string
}

export const AGENT_KEYS: readonly AgentKey[] = ['performance', 'reliability', 'security', 'api', 'lead']

const idleAgents = (): Record<AgentKey, AgentState> => ({
  performance: { stage: 'queued' },
  reliability: { stage: 'queued' },
  security: { stage: 'queued' },
  api: { stage: 'queued' },
  lead: { stage: 'queued' },
})

interface DoctorState {
  /** Which capture the run/report belongs to ("fileName:count"); a new capture invalidates it. */
  captureKey: string | null
  running: boolean
  agents: Record<AgentKey, AgentState>
  report: DiagnosisReport | null
  error: { code: AiError['code'] | 'unknown'; message: string } | null
  startedAt: number | null
  finishedAt: number | null
}

/*
 * Lives outside the view so a diagnosis keeps running (and its report survives) while the
 * user switches tabs to inspect the requests it points at.
 */
export const useDoctorStore = create<DoctorState>()(() => ({
  captureKey: null,
  running: false,
  agents: idleAgents(),
  report: null,
  error: null,
  startedAt: null,
  finishedAt: null,
}))

let controller: AbortController | null = null

export const captureKeyOf = (fileName: string, count: number) => `${fileName}:${count}`

export async function startDiagnosis(entries: readonly Entry[], captureKey: string): Promise<void> {
  controller?.abort()
  const own = new AbortController()
  controller = own
  useDoctorStore.setState({
    captureKey,
    running: true,
    agents: idleAgents(),
    report: null,
    error: null,
    startedAt: Date.now(),
    finishedAt: null,
  })

  try {
    const report = await runDiagnosis(
      entries,
      (event) => {
        if (controller !== own) return
        if (event.type === 'agent') {
          const { agent, type: _type, ...rest } = event
          useDoctorStore.setState((s) => ({
            agents: { ...s.agents, [agent]: { ...s.agents[agent], ...rest } },
          }))
        } else {
          useDoctorStore.setState({ report: event.report })
        }
      },
      own.signal,
    )
    if (controller !== own) return
    useDoctorStore.setState({ report, running: false, finishedAt: Date.now() })
  } catch (error) {
    if (controller !== own) return
    const aborted = own.signal.aborted || (error instanceof AiError && error.code === 'aborted')
    useDoctorStore.setState({
      running: false,
      finishedAt: Date.now(),
      error: aborted
        ? null
        : {
            code: error instanceof AiError ? error.code : 'unknown',
            message: error instanceof Error ? error.message : String(error),
          },
      agents: aborted ? idleAgents() : useDoctorStore.getState().agents,
    })
  } finally {
    if (controller === own) controller = null
  }
}

export function cancelDiagnosis(): void {
  controller?.abort()
  controller = null
  useDoctorStore.setState({ running: false, agents: idleAgents() })
}
