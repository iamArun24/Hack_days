import { Download, FileCode2 } from 'lucide-react'
import { generateOpenApi, previewPayload } from '@/ai'
import { AiButton, AiError, AiThinking, WhatIsSent } from '@/components/ai/ai-kit'
import { useAiTask } from '@/components/ai/ai-task'
import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Endpoint } from '@/har/endpoints'
import type { Entry } from '@/har/types'
import { formatDuration, pluralize } from '@/lib/format'
import { downloadText } from '@/lib/download'
import { useState } from 'react'

/** Light YAML colouring: keys, comments and scalars — enough to scan a spec comfortably. */
function YamlLine({ line }: { line: string }) {
  const comment = line.match(/^(\s*)(#.*)$/)
  if (comment) return <span className="text-syntax-comment">{line}</span>
  const pair = line.match(/^(\s*-?\s*)([^:#]+?)(:)(\s.*)?$/)
  if (!pair) return <span>{line}</span>
  const [, indent = '', key = '', colon = '', value = ''] = pair
  const v = value.trim()
  const valueClass = /^['"]/.test(v)
    ? 'text-syntax-string'
    : /^-?\d/.test(v)
      ? 'text-syntax-number'
      : /^(true|false|null)$/.test(v)
        ? 'text-syntax-literal'
        : 'text-foreground'
  return (
    <span>
      {indent}
      <span className="text-syntax-key">{key}</span>
      <span className="text-subtle-foreground">{colon}</span>
      <span className={valueClass}>{value}</span>
    </span>
  )
}

/** "Generate OpenAPI" for the endpoints on screen; the spec opens in a dialog with copy/download. */
export function OpenApiAction({
  endpoints,
  entries,
}: {
  endpoints: readonly Endpoint[]
  entries: readonly Entry[]
}) {
  const [open, setOpen] = useState(false)
  const { state, run, cancel } = useAiTask<string>()

  const generate = () => {
    setOpen(true)
    void run((signal) => generateOpenApi(endpoints, entries, signal))
  }

  const onOpenChange = (next: boolean) => {
    if (!next && state.status === 'running') cancel()
    setOpen(next)
  }

  const yaml = state.status === 'done' ? state.data : ''

  return (
    <>
      <AiButton onClick={generate} loading={state.status === 'running'} disabled={!endpoints.length}>
        Generate OpenAPI
      </AiButton>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode2 className="size-4 text-primary" /> OpenAPI draft
            </DialogTitle>
            <DialogDescription>
              Inferred from {pluralize(endpoints.length, 'route')} and sample payloads. Review before
              publishing: a HAR shows what was called, not everything the API accepts.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex min-h-0 flex-col gap-3">
            {state.status === 'running' && (
              <AiThinking
                label="Reading routes, parameters and sample bodies…"
                onCancel={() => onOpenChange(false)}
              />
            )}
            {state.status === 'error' && (
              <AiError
                message={state.message}
                onRetry={generate}
                needsSetup={
                  state.code === 'no-keys' || state.code === 'consent' || state.code === 'invalid-key'
                }
              />
            )}
            {state.status === 'done' && (
              <div className="group/code relative min-h-0 animate-rise rounded-xl border bg-muted/40">
                <pre className="max-h-[52vh] overflow-auto p-3 font-mono text-xs leading-relaxed">
                  {yaml.split('\n').map((line, i) => (
                    <div key={i}>
                      <YamlLine line={line} />
                    </div>
                  ))}
                </pre>
                <CopyButton
                  value={yaml}
                  label="Copy YAML"
                  className="absolute top-1.5 right-3 bg-popover shadow-sm"
                />
              </div>
            )}
            <WhatIsSent payload={() => previewPayload('openapi', entries)} />
          </DialogBody>
          <DialogFooter>
            {state.status === 'done' && (
              <span className="mr-auto text-[11px] text-subtle-foreground">
                AI generated in {formatDuration(state.ms)} · verify before use
              </span>
            )}
            <Button size="sm" variant="ghost" onClick={generate} disabled={state.status === 'running'}>
              Regenerate
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!yaml}
              onClick={() => downloadText(yaml, 'openapi.yaml', 'application/yaml')}
            >
              <Download /> Download openapi.yaml
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
