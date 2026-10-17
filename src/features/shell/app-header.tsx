import { Search } from 'lucide-react'
import { GithubIcon, LogoMark, REPO_URL } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { KbdCombo } from '@/components/ui/kbd'
import { Tooltip } from '@/components/ui/tooltip'
import { MOD } from '@/lib/platform'
import { useAppStore } from '@/store'
import { ExportMenu } from './export-menu'
import { FileMenu } from './file-menu'
import { ThemeMenu } from './theme-menu'
import { ValidationPopover } from './validation-popover'

export function AppHeader() {
  const openDialog = useAppStore((s) => s.openDialog)

  return (
    <header className="relative z-20 flex h-13 shrink-0 items-center gap-2 px-3 glass">
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-px aurora-line opacity-80" />
      <div className="flex min-w-0 items-center gap-1.5">
        <LogoMark className="size-7 shrink-0 drop-shadow-[0_4px_10px_color-mix(in_oklab,var(--color-primary)_35%,transparent)]" />
        <span className="hidden items-baseline gap-1.5 md:inline-flex">
          <span className="font-display text-[15px] font-semibold tracking-tight">HAR Viewer</span>
          <span className="text-iridescent text-2xs font-semibold tracking-[0.18em] uppercase">Lumen</span>
        </span>
        <span className="mx-1 hidden text-border-strong md:inline" aria-hidden>
          /
        </span>
        <FileMenu />
        <ValidationPopover />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => openDialog({ type: 'palette' })}
          className="group/search hidden h-8.5 w-72 items-center gap-2 rounded-full border bg-panel/70 px-3.5 text-[13px] whitespace-nowrap text-subtle-foreground shadow-xs transition-[border-color,box-shadow,width,color] duration-300 outline-none hover:w-80 hover:border-primary/40 hover:text-muted-foreground hover:shadow-[0_6px_20px_-10px_var(--color-primary)] focus-visible:ring-2 focus-visible:ring-ring/40 md:flex"
        >
          <Search className="size-4 transition-colors group-hover/search:text-primary" />
          <span className="flex-1 truncate text-left">Search or run a command…</span>
          <KbdCombo keys={[MOD, 'K']} />
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          onClick={() => openDialog({ type: 'palette' })}
          aria-label="Command palette"
        >
          <Search />
        </Button>
        <ExportMenu />
        <ThemeMenu />
        <Tooltip content="Source on GitHub">
          <Button variant="ghost" size="icon-sm" asChild>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="GitHub repository">
              <GithubIcon />
            </a>
          </Button>
        </Tooltip>
      </div>
    </header>
  )
}
