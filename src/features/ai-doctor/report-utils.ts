import type { DiagnosisReport } from '@/ai'

/** Request ids referenced anywhere in the report: the "flagged" count in the summary. */
export function flaggedIds(report: DiagnosisReport): Set<number> {
  const ids = new Set<number>()
  for (const f of report.rootCauses) for (const id of f.entryIds) ids.add(id)
  for (const a of report.actionPlan) for (const id of a.entryIds) ids.add(id)
  return ids
}
