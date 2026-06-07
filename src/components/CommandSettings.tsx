import { useState } from 'react'
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getDefaultVoiceCommand } from '@electron/shared/voice-commands'
import type { VoiceCommandId, VoiceCommandsConfig } from '@electron/shared/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface CommandSettingsProps {
  commands: VoiceCommandsConfig
  onChange: (commands: VoiceCommandsConfig) => void
}

export function CommandSettings({ commands, onChange }: CommandSettingsProps) {
  const { t } = useTranslation()
  const [expandedId, setExpandedId] = useState<VoiceCommandId | null>(null)

  const updatePrompt = (id: VoiceCommandId, prompt: string) => {
    onChange({
      commands: commands.commands.map((cmd) => (cmd.id === id ? { ...cmd, prompt } : cmd)),
    })
  }

  const resetPrompt = (id: VoiceCommandId) => {
    const def = getDefaultVoiceCommand(id)
    onChange({
      commands: commands.commands.map((cmd) =>
        cmd.id === id ? { ...cmd, prompt: def.prompt } : cmd,
      ),
    })
  }

  const toggleExpanded = (id: VoiceCommandId) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-bold">{t('settings.commands.tab')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('settings.commands.intro')}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {commands.commands.map((cmd) => {
          const expanded = expandedId === cmd.id
          const nameKey = `settings.commands.items.${cmd.id}.name` as const
          const descKey = `settings.commands.items.${cmd.id}.desc` as const

          return (
            <div key={cmd.id} className="rounded-md border border-border">
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3 text-left no-drag hover:bg-muted/40"
                onClick={() => toggleExpanded(cmd.id)}
                aria-expanded={expanded}
              >
                {expanded ? (
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t(nameKey)}</p>
                  <p className="truncate text-sm text-muted-foreground">{t(descKey)}</p>
                </div>
                <code className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {cmd.trigger}
                </code>
              </button>

              {expanded && (
                <div className="space-y-3 border-t border-border px-4 py-4">
                  <div className="space-y-1.5">
                    <Label htmlFor={`cmd-prompt-${cmd.id}`}>
                      {t('settings.commands.promptLabel')}
                    </Label>
                    <Textarea
                      id={`cmd-prompt-${cmd.id}`}
                      className="min-h-48 font-mono text-sm no-drag"
                      value={cmd.prompt}
                      onChange={(e) => updatePrompt(cmd.id, e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="no-drag cursor-pointer"
                    onClick={() => resetPrompt(cmd.id)}
                  >
                    <RotateCcw className="mr-1.5 size-3.5" aria-hidden />
                    {t('settings.commands.resetDefault')}
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
