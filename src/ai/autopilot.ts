/*
 * Autopilot contract — shared by the pipeline, the loading screen, the AI Analysis view and
 * the inspector. Types and the explain cache are final; `runAutopilot` / `suggestViews` are
 * implemented in ./autopilot-run.ts and re-exported from '@/ai'.
 */
import type { NlFilterResult, RequestExplanation } from './contract'

/** Pre-computed request explanations, keyed by Entry.id. The inspector reads this first. */
export const explainCache = new Map<number, { data: RequestExplanation; ms: number }>()

export type AutopilotStageId = 'specialists' | 'lead' | 'explain' | 'views' | 'openapi'
export type AutopilotStageState = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

export interface AutopilotStage {
  id: AutopilotStageId
  label: string
  state: AutopilotStageState
  /** Short live detail, e.g. "3 of 4 agents done" or "Explaining #22 GET /v2/recs". */
  detail: string | null
}

/** A one-click filter the AI recommends for this capture. */
export interface SuggestedView {
  label: string
  reason: string
  criteria: NlFilterResult['criteria']
}

export interface AutopilotResult {
  /** Entry ids whose explanations were pre-computed into explainCache. */
  explained: number[]
  suggestions: SuggestedView[]
  /** OpenAPI 3.1 YAML when the capture had API traffic, else null. */
  openapi: string | null
}

export type AutopilotEvent =
  { type: 'stage'; stage: AutopilotStage } | { type: 'done'; result: AutopilotResult }

export const AUTOPILOT_STAGES: ReadonlyArray<Pick<AutopilotStage, 'id' | 'label'>> = [
  { id: 'specialists', label: 'Specialist agents' },
  { id: 'lead', label: 'Lead agent' },
  { id: 'explain', label: 'Explaining key requests' },
  { id: 'views', label: 'Suggesting views' },
  { id: 'openapi', label: 'Drafting API spec' },
]
