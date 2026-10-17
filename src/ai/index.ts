/*
 * Public entry point for the AI layer (see ./contract.ts for the types and design notes).
 * UI code imports only from '@/ai'.
 */
export * from './contract'
export * from './autopilot'
export {
  pickExplainTargets,
  runAutopilot,
  suggestViews,
  type AutopilotOptions,
  type DiagnoseRunner,
} from './autopilot-run'
export { useAiSettings, normalizeKeys } from './settings'
export { aiReady, callAi, listModels, testKeys, useKeyStatuses } from './groq'
export { captureDigest, maskText, redactUrl, requestDigest } from './digest'
export {
  comparePreview,
  explainComparison,
  explainRequest,
  generateOpenApi,
  nlToFilter,
  previewPayload,
  runDiagnosis,
  validateFilter,
} from './agents'
