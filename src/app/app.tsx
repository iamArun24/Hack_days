import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { aiReady, useAiSettings } from '@/ai'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useFileDrop } from '@/hooks/use-file-drop'
import { useThemeEffect } from '@/hooks/use-theme'
import { useUrlHashSync } from '@/hooks/use-url-sync'
import { onFreshCapture, openFiles, restoreSession } from '@/services/capture'
import { applyCriteriaFromHash } from '@/services/url-state'
import { useAppStore } from '@/store'
import { useHasCapture } from '@/store/selectors'
import { AiSettingsDialog } from '@/features/ai-settings/ai-settings-dialog'
import { openAiSettings } from '@/features/ai-settings/events'
import { AutopilotPill, AutopilotScreen } from '@/features/autopilot/autopilot-screen'
import { startAutopilot, useAutopilotStore } from '@/features/autopilot/autopilot-store'
import { AppShell } from '@/features/shell/app-shell'
import { useGlobalShortcuts } from '@/features/shortcuts/use-global-shortcuts'
import { DropOverlay, LoadingScreen } from '@/features/welcome/status-screens'
import { WelcomeScreen } from '@/features/welcome/welcome-screen'

const onDropFiles = (files: File[]) => void openFiles(files)

/** The cinematic landing (three.js) loads on demand; the classic welcome is its no-WebGL fallback. */
const Landing = lazy(async () => ({ default: (await import('@/features/landing/landing')).Landing }))

const hasWebGL = () => {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

function Home() {
  const [fallback, setFallback] = useState(() => !hasWebGL())
  const onFallback = useCallback(() => setFallback(true), [])
  if (fallback) return <WelcomeScreen />
  return (
    <Suspense fallback={<LoadingScreen label="Preparing the journey" progress={null} />}>
      <Landing onFallback={onFallback} />
    </Suspense>
  )
}

/** Every user-initiated upload kicks off the agent pipeline (or nudges toward setting AI up). */
function useAutopilotTrigger() {
  useEffect(
    () =>
      onFreshCapture(() => {
        if (startAutopilot()) return
        const { keys, autopilot } = useAiSettings.getState()
        if (autopilot && !aiReady())
          toast('Get an automatic AI analysis', {
            description: keys.length
              ? 'Allow sending a redacted digest to Groq to let the agents analyse each upload.'
              : 'Add a Groq API key and the agents will diagnose every capture you open.',
            action: { label: 'Set up AI', onClick: openAiSettings },
          })
      }),
    [],
  )
}

function useDocumentTitle() {
  const fileName = useAppStore((s) => s.fileName)
  useEffect(() => {
    document.title = fileName ? `${fileName} · HAR Viewer` : 'HAR Viewer'
  }, [fileName])
}

export function App() {
  const hasCapture = useHasCapture()
  const loading = useAppStore((s) => s.loading)
  const [restoring, setRestoring] = useState(true)
  const dragging = useFileDrop(onDropFiles)
  const autopilotForeground = useAutopilotStore((s) => s.foreground)

  useThemeEffect()
  useDocumentTitle()
  useGlobalShortcuts()
  useAutopilotTrigger()
  useUrlHashSync(hasCapture && !restoring)

  useEffect(() => {
    applyCriteriaFromHash()
    void restoreSession().finally(() => setRestoring(false))
  }, [])

  return (
    <TooltipProvider delayDuration={450} skipDelayDuration={150}>
      {restoring ? (
        <LoadingScreen label="Restoring your last session" progress={null} />
      ) : loading ? (
        <LoadingScreen {...loading} />
      ) : hasCapture ? (
        autopilotForeground ? (
          <AutopilotScreen />
        ) : (
          <AppShell />
        )
      ) : (
        <Home />
      )}
      {hasCapture && !loading && <AutopilotPill />}
      <AiSettingsDialog />
      <DropOverlay visible={dragging} replacing={hasCapture} />
      <Toaster />
    </TooltipProvider>
  )
}
