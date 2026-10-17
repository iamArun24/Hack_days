import { toast } from 'sonner'
import { useKonami } from '@/hooks/use-konami'
import { useSpotlight } from '@/hooks/use-spotlight'
import { celebrate } from '@/lib/celebrate'
import { CommandPalette } from '../command/command-palette'
import { DiffDialog } from '../dialogs/diff-dialog'
import { NoteDialog } from '../dialogs/note-dialog'
import { ReplayDialog } from '../dialogs/replay-dialog'
import { ShortcutsDialog } from '../dialogs/shortcuts-dialog'
import { AppHeader } from './app-header'
import { SelectionBar } from './selection-bar'
import { StatusBar } from './status-bar'
import { ViewTabs } from './view-tabs'
import { Workspace } from './workspace'

const packetStorm = () => {
  celebrate({ count: 220, spread: 1.4 })
  setTimeout(() => celebrate({ x: window.innerWidth * 0.2, count: 90 }), 180)
  setTimeout(() => celebrate({ x: window.innerWidth * 0.8, count: 90 }), 320)
  toast('Packet storm unlocked', { description: '↑↑↓↓←→←→BA, a true network nerd.' })
}

export function AppShell() {
  useSpotlight()
  useKonami(packetStorm)

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      {/* Calm aurora wash behind all chrome. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 size-[520px] animate-aurora rounded-full bg-(--aurora-1) blur-3xl" />
        <div className="absolute -top-24 right-[-10%] size-[460px] animate-aurora rounded-full bg-(--aurora-2) blur-3xl [animation-delay:-6s]" />
        <div className="absolute bottom-[-30%] left-1/3 size-[560px] animate-aurora rounded-full bg-(--aurora-3) opacity-60 blur-3xl [animation-delay:-11s]" />
      </div>
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <AppHeader />
        <ViewTabs />
        <Workspace />
        <StatusBar />
      </div>
      <SelectionBar />
      <CommandPalette />
      <ShortcutsDialog />
      <NoteDialog />
      <DiffDialog />
      <ReplayDialog />
    </div>
  )
}
