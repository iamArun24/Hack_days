import {
  Bot,
  Brain,
  ChevronRight,
  Copy,
  Download,
  Eye,
  KeyRound,
  Lock,
  RotateCcw,
  Sparkles,
  Square,
  Stethoscope,
  TriangleAlert,
} from 'lucide-react'
import { Collapsible } from 'radix-ui'
import { aiReady, previewPayload, useAiSettings, useKeyStatuses, type AiError } from '@/ai'
import { Button } from '@/components/ui/button'
import { copyText } from '@/lib/clipboard'
import { baseName, downloadText } from '@/lib/download'
import { formatDuration, formatNumber } from '@/lib/format'
import { useAppStore } from '@/store'
import { AgentFlow } from './agent-flow'
import { ApiSpecDraft, AutopilotTimeline, ExplainedRequests, QuickActions, SuggestedViews } from './ai-tools'
import { cancelAutopilot, startAutopilot, useAutopilotStore } from './autopilot-adapter'
import { AGENT_META } from './agent-meta'
import { cancelDiagnosis, captureKeyOf, startDiagnosis, useDoctorStore } from './doctor-store'
import { reportToMarkdown } from './report-markdown'
import { flaggedIds } from './report-utils'
import { FindingsPanel, OpenQuestions, Panel, SummaryBand } from './report-view'

const openSettings = () => window.dispatchEvent(new CustomEvent('har:open-ai-settings'))

const ERROR_COPY: Record<AiError['code'] | 'unknown', { title: string; hint: string }> = {
  'no-keys': {
    title: 'No Groq keys yet',
    hint: 'Add at least one API key in AI settings to run the agents.',
  },
  'invalid-key': {
    title: 'A Groq key was rejected',
    hint: 'Check the keys in AI settings; remove or replace the invalid one.',
  },
  'rate-limited': {
    title: 'All keys are cooling down',
    hint: 'Groq rate limits were hit on every key. Try again in a few seconds, or add more keys to spread the load.',
  },
  network: { title: 'Could not reach Groq', hint: 'Check your connection (or an ad blocker) and try again.' },
  'bad-output': {
    title: 'The model returned something unreadable',
    hint: 'This happens occasionally. Run it again.',
  },
  aborted: { title: 'Cancelled', hint: 'The diagnosis was stopped.' },
  consent: { title: 'Consent needed', hint: 'Allow sending a redacted summary to Groq in AI settings.' },
  unknown: {
    title: 'Something went wrong',
    hint: 'Try again. If it keeps failing, check the browser console.',
  },
}

function SetupState() {
  return (
    <div className="mx-auto flex max-w-3xl animate-rise flex-col items-center gap-6 py-10 text-center">
      <span className="grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-lavender via-peach to-sage shadow-[var(--shadow-soft)]">
        <Stethoscope className="size-7 text-white drop-shadow" />
      </span>
      <div>
        <h1 className="font-display text-[clamp(1.8rem,3.6vw,2.6rem)] leading-tight font-light tracking-tight">
          Let a team of AI agents <em className="text-iridescent">diagnose this capture.</em>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[14px] text-pretty text-muted-foreground">
          Four specialists (performance, reliability, security and API design) study the capture in parallel
          on Groq. A lead agent then merges their findings into ranked root causes and a fix plan, linked to
          the exact requests.
        </p>
      </div>
      <div className="grid w-full gap-3 sm:grid-cols-5">
        {(['performance', 'reliability', 'security', 'api', 'lead'] as const).map((id) => {
          const meta = AGENT_META[id]
          return (
            <div key={id} className="spotlight card-lift rounded-2xl border bg-panel/80 p-3 text-left">
              <span className={`grid size-8 place-items-center rounded-xl ${meta.tint}`}>
                <meta.icon className="size-4" />
              </span>
              <p className="mt-2 text-xs font-semibold">{meta.label}</p>
              <p className="text-2xs text-muted-foreground">{meta.role}</p>
            </div>
          )
        })}
      </div>
      <Button variant="primary" size="lg" onClick={openSettings}>
        <KeyRound /> Connect Groq keys
      </Button>
      <p className="flex max-w-lg items-start gap-2 text-left text-xs text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0 text-success" />
        Only a compact, redacted summary is sent (no cookies, tokens or auth headers). Your keys are stored in
        this browser only. Add several keys to run agents in parallel and avoid rate limits.
      </p>
    </div>
  )
}

function PreviewPayload() {
  const entries = useAppStore((s) => s.entries)
  const text = previewPayload('diagnosis', entries)
  return (
    <Collapsible.Root className="group/preview rounded-2xl border bg-panel/70">
      <Collapsible.Trigger className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-muted-foreground outline-none hover:text-foreground">
        <Eye className="size-3.5" />
        <span className="flex-1">Preview exactly what is sent</span>
        <span className="font-mono tabular">≈{formatNumber(Math.ceil(text.length / 4))} tokens</span>
        <ChevronRight className="size-3.5 transition-transform group-data-[state=open]/preview:rotate-90" />
      </Collapsible.Trigger>
      <Collapsible.Content>
        <pre className="max-h-72 overflow-auto border-t px-4 py-3 font-mono text-2xs leading-relaxed whitespace-pre-wrap text-foreground/80">
          {text || 'Nothing to preview yet.'}
        </pre>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

export function DoctorView() {
  const entries = useAppStore((s) => s.entries)
  const fileName = useAppStore((s) => s.fileName)
  // Subscribing keeps readiness reactive; aiReady() reads the same store.
  useAiSettings((s) => s.keys.length + Number(s.consent))
  const keys = useKeyStatuses()
  const doctor = useDoctorStore()
  const autopilot = useAutopilotStore()
  const captureKey = captureKeyOf(fileName, entries.length)
  const current = doctor.captureKey === captureKey
  const report = current ? doctor.report : null
  const autoCurrent = autopilot.captureKey === captureKey
  const autoRunning = autoCurrent && autopilot.status === 'running'
  const autoResult = autoCurrent ? autopilot.result : null
  const running = (current && doctor.running) || autoRunning
  const error = current ? doctor.error : null
  const ready = aiReady()
  const fileBase = baseName(fileName)

  // Re-runs go through the autopilot so explanations, views and the spec refresh with the report.
  const run = () => void startAutopilot()
  const runDiagnosisOnly = () => void startDiagnosis(entries, captureKey)
  const cancel = () => {
    cancelAutopilot()
    cancelDiagnosis()
  }
  const markdown = () => (report ? reportToMarkdown(report, entries, fileName) : '')

  const sidebar = (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-0">
      <QuickActions
        onCopyReport={report ? () => void copyText(markdown(), 'Report copied as Markdown') : null}
        openapi={autoResult?.openapi ?? null}
        fileBase={fileBase}
      />
      {autoResult && <ExplainedRequests ids={autoResult.explained} entries={entries} />}
      {autoResult && <SuggestedViews views={autoResult.suggestions} />}
      {autoResult?.openapi && <ApiSpecDraft yaml={autoResult.openapi} fileBase={fileBase} />}
      {report && <OpenQuestions questions={report.openQuestions} />}
    </aside>
  )

  const took =
    current && doctor.startedAt && doctor.finishedAt && !running
      ? formatDuration(doctor.finishedAt - doctor.startedAt)
      : null

  return (
    <div className="@container h-full overflow-y-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 @3xl:px-6 @3xl:py-5">
        {!ready && !report ? (
          <SetupState />
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b pb-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-lavender via-peach to-sage shadow-[var(--shadow-soft)]">
                <Sparkles className="size-5 text-white drop-shadow" />
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-display text-xl font-medium tracking-tight">
                  {running ? 'Agents at work…' : report ? 'AI Analysis' : 'Analyse this capture'}
                </h1>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="truncate font-medium text-foreground/80">{fileName}</span>
                  <span aria-hidden>·</span>
                  <span>{formatNumber(entries.length)} requests</span>
                  <span aria-hidden>·</span>
                  <span>
                    {keys.length} key{keys.length === 1 ? '' : 's'}
                  </span>
                  {took && (
                    <>
                      <span aria-hidden>·</span>
                      <span>analysed in {took}</span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button variant="ghost" size="icon-sm" onClick={openSettings} aria-label="AI settings">
                  <KeyRound />
                </Button>
                {report && !running && (
                  <>
                    <Button size="sm" onClick={() => void copyText(markdown(), 'Report copied as Markdown')}>
                      <Copy /> Copy
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => downloadText(markdown(), `${fileBase}-diagnosis.md`, 'text/markdown')}
                    >
                      <Download /> Report .md
                    </Button>
                  </>
                )}
                {running ? (
                  <Button size="sm" variant="danger" onClick={cancel}>
                    <Square /> Cancel
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" onClick={run} disabled={!ready}>
                    {report ? <RotateCcw /> : <Brain />} {report ? 'Re-run' : 'Run analysis'}
                  </Button>
                )}
              </div>
            </header>

            {error && (
              <div className="flex animate-rise items-start gap-3 rounded-2xl border border-danger/30 bg-blush/15 p-4">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">{ERROR_COPY[error.code].title}</p>
                  <p className="text-xs text-muted-foreground">{ERROR_COPY[error.code].hint}</p>
                  <p className="mt-1 truncate font-mono text-2xs text-subtle-foreground">{error.message}</p>
                </div>
                {(error.code === 'no-keys' || error.code === 'invalid-key' || error.code === 'consent') && (
                  <Button size="sm" onClick={openSettings}>
                    Open settings
                  </Button>
                )}
              </div>
            )}

            {(running || (current && !report && doctor.startedAt)) && (
              <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <Panel title="Agents" icon={Bot}>
                  <div className="p-4">
                    <AgentFlow agents={doctor.agents} />
                  </div>
                </Panel>
                {autoRunning && <AutopilotTimeline stages={autopilot.stages} />}
              </div>
            )}

            {!running && !report && !doctor.startedAt && (
              <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <Panel>
                  <div className="flex flex-col items-center gap-3 p-10 text-center">
                    <Brain className="size-8 text-primary" />
                    <p className="max-w-md text-[13px] text-muted-foreground">
                      Run the agents to get ranked root causes, a fix plan by owner, and links to every
                      request involved. It usually takes a few seconds.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button variant="primary" onClick={run} disabled={!ready}>
                        <Sparkles /> Run full analysis
                      </Button>
                      <Button onClick={runDiagnosisOnly} disabled={!ready}>
                        <Brain /> Diagnosis only
                      </Button>
                    </div>
                  </div>
                </Panel>
                <PreviewPayload />
              </div>
            )}

            {report && !running && (
              <>
                <SummaryBand report={report} flagged={flaggedIds(report).size} />
                <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                  <FindingsPanel report={report} entries={entries} />
                  {sidebar}
                </div>
              </>
            )}

            {!report && autoResult && !running && (
              <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                <Panel>
                  <p className="p-8 text-center text-[13px] text-muted-foreground">
                    The diagnosis did not finish, but the other AI results are ready.
                  </p>
                </Panel>
                {sidebar}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
