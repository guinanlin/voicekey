import * as React from 'react'
import { Bot, Copy, Paperclip, Send, User, X, FileText, ImageIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type {
  HistoryCraftsmanChatMessage,
  HistoryCraftsmanChatSavePayload,
  VoiceCommandId,
} from '@electron/shared/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

export interface ChatAttachment {
  id: string
  name: string
  size: number
  type: string
  previewUrl?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: ChatAttachment[]
  timestamp: number
}

export interface StartCommandParams {
  historyItemId: string
  commandId: VoiceCommandId
  commandLabel: string
  systemPrompt: string
  text: string
}

export interface ChatPanelHandle {
  startCommand: (params: StartCommandParams) => Promise<void>
}

interface ChatPanelProps {
  className?: string
}

interface ActiveChatSession {
  historyItemId: string
  commandId: VoiceCommandId
  commandLabel: string
  systemPrompt: string
  sourceText: string
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImageType(type: string): boolean {
  return type.startsWith('image/')
}

function AttachmentChip({
  attachment,
  onRemove,
  removable,
  removeLabel,
}: {
  attachment: ChatAttachment
  onRemove?: () => void
  removable?: boolean
  removeLabel?: string
}) {
  const Icon = isImageType(attachment.type) ? ImageIcon : FileText
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-background/60 px-2 py-1 text-xs text-muted-foreground">
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span className="max-w-[120px] truncate">{attachment.name}</span>
      <span className="text-muted-foreground/50">{formatFileSize(attachment.size)}</span>
      {removable && onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded p-0.5 hover:bg-accent hover:text-foreground"
          aria-label={removeLabel}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const { t } = useTranslation()
  const isUser = message.role === 'user'

  const copyContent = React.useCallback(() => {
    if (!message.content.trim()) return
    void navigator.clipboard.writeText(message.content)
    toast.success(t('history.chat.copySuccess'))
  }, [message.content, t])

  return (
    <div className={cn('flex gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground',
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div
        className={cn(
          'flex min-w-0 max-w-[85%] flex-col gap-1.5',
          isUser ? 'items-end' : 'items-start',
        )}
      >
        {message.attachments && message.attachments.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {message.attachments.map((att) =>
              isImageType(att.type) && att.previewUrl ? (
                <img
                  key={att.id}
                  src={att.previewUrl}
                  alt={att.name}
                  className="max-h-24 max-w-[140px] rounded-md border border-border/40 object-cover"
                />
              ) : (
                <AttachmentChip key={att.id} attachment={att} />
              ),
            )}
          </div>
        ) : null}
        {message.content ? (
          <div className={cn('relative', !isUser && 'group/bubble')}>
            <div
              className={cn(
                'rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words',
                isUser
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/60 text-foreground pb-7',
              )}
            >
              {message.content}
            </div>
            {!isUser ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute bottom-1 right-1 h-5 w-5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/bubble:opacity-100 focus-visible:opacity-100"
                onClick={copyContent}
                title={t('history.chat.copy')}
                aria-label={t('history.chat.copy')}
              >
                <Copy className="h-3 w-3" aria-hidden />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function toApiMessages(messages: ChatMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  return messages.filter((m) => m.content.trim()).map((m) => ({ role: m.role, content: m.content }))
}

function toPersistedMessages(messages: ChatMessage[]): HistoryCraftsmanChatMessage[] {
  return messages
    .filter((m) => m.content.trim())
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    }))
}

function fromPersistedMessages(messages: HistoryCraftsmanChatMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp,
  }))
}

export const ChatPanel = React.forwardRef<ChatPanelHandle, ChatPanelProps>(({ className }, ref) => {
  const { t } = useTranslation()
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [input, setInput] = React.useState('')
  const [pendingAttachments, setPendingAttachments] = React.useState<ChatAttachment[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [systemPrompt, setSystemPrompt] = React.useState<string | null>(null)
  const [activeCommandLabel, setActiveCommandLabel] = React.useState<string | null>(null)
  const [activeSession, setActiveSession] = React.useState<ActiveChatSession | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' })
  }, [])

  React.useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading, scrollToBottom])

  React.useEffect(() => {
    return () => {
      pendingAttachments.forEach((att) => {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl)
      })
    }
  }, [pendingAttachments])

  const resetSession = React.useCallback(() => {
    setMessages([])
    setInput('')
    setActiveSession(null)
    setPendingAttachments((prev) => {
      prev.forEach((att) => {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl)
      })
      return []
    })
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [])

  const persistSession = React.useCallback(
    async (session: ActiveChatSession, nextMessages: ChatMessage[]) => {
      const api = window.electronAPI
      if (!api?.saveHistoryCraftsmanChat) return

      const payload: HistoryCraftsmanChatSavePayload = {
        historyItemId: session.historyItemId,
        commandId: session.commandId,
        commandLabel: session.commandLabel,
        systemPrompt: session.systemPrompt,
        sourceText: session.sourceText,
        messages: toPersistedMessages(nextMessages),
      }

      await api.saveHistoryCraftsmanChat(payload)
    },
    [],
  )

  const requestModelReply = React.useCallback(
    async (nextMessages: ChatMessage[], prompt: string, session: ActiveChatSession | null) => {
      const api = window.electronAPI
      if (!api?.craftsmanChat) {
        toast.error(t('history.chat.noApiKey'))
        return
      }

      setIsLoading(true)
      try {
        const result = await api.craftsmanChat({
          systemPrompt: prompt,
          messages: toApiMessages(nextMessages),
        })

        if (!result.ok) {
          const errMsg =
            result.code === 'no_api_key'
              ? t('history.chat.noApiKey')
              : (result.message ?? t('history.chat.requestFailed'))
          toast.error(errMsg)
          return
        }

        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: result.content ?? '',
          timestamp: Date.now(),
        }
        const finalMessages = [...nextMessages, assistantMessage]
        setMessages(finalMessages)
        if (session) {
          await persistSession(session, finalMessages)
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : t('history.chat.requestFailed')
        toast.error(errMsg)
      } finally {
        setIsLoading(false)
      }
    },
    [persistSession, t],
  )

  const sendUserMessage = React.useCallback(
    async (content: string, attachments: ChatAttachment[] = []) => {
      const trimmed = content.trim()
      if (!trimmed && attachments.length === 0) return
      if (!systemPrompt?.trim()) {
        toast.error(t('history.chat.noCommand'))
        return
      }
      if (!activeSession) {
        toast.error(t('history.chat.noCommand'))
        return
      }

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        attachments: attachments.length > 0 ? attachments : undefined,
        timestamp: Date.now(),
      }
      const nextMessages = [...messages, userMessage]
      setMessages(nextMessages)
      setInput('')
      setPendingAttachments([])
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }

      await persistSession(activeSession, nextMessages)
      await requestModelReply(nextMessages, systemPrompt, activeSession)
    },
    [activeSession, messages, systemPrompt, persistSession, requestModelReply, t],
  )

  React.useImperativeHandle(
    ref,
    () => ({
      startCommand: async ({
        historyItemId,
        commandId,
        commandLabel,
        systemPrompt: prompt,
        text,
      }: StartCommandParams) => {
        resetSession()
        setSystemPrompt(prompt)
        setActiveCommandLabel(commandLabel)
        const session: ActiveChatSession = {
          historyItemId,
          commandId,
          commandLabel,
          systemPrompt: prompt,
          sourceText: text.trim(),
        }
        setActiveSession(session)

        const existing = await window.electronAPI?.getHistoryCraftsmanChat?.(
          historyItemId,
          commandId,
        )
        if (existing?.messages.length) {
          setMessages(fromPersistedMessages(existing.messages))
          return
        }

        const userMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: text.trim(),
          timestamp: Date.now(),
        }
        setMessages([userMessage])
        await persistSession(session, [userMessage])
        await requestModelReply([userMessage], prompt, session)
      },
    }),
    [persistSession, resetSession, requestModelReply],
  )

  const canSend =
    !isLoading && !!systemPrompt && (input.trim().length > 0 || pendingAttachments.length > 0)

  const handleFileSelect = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    const newAttachments: ChatAttachment[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }))
    setPendingAttachments((prev) => [...prev, ...newAttachments])
    e.target.value = ''
  }, [])

  const removePendingAttachment = React.useCallback((id: string) => {
    setPendingAttachments((prev) => {
      const removed = prev.find((a) => a.id === id)
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((a) => a.id !== id)
    })
  }, [])

  const handleSend = React.useCallback(async () => {
    if (!canSend) return
    await sendUserMessage(input, [...pendingAttachments])
  }, [canSend, input, pendingAttachments, sendUserMessage])

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void handleSend()
      }
    },
    [handleSend],
  )

  const handleInputChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [])

  const headerTitle = activeCommandLabel
    ? t('history.chat.activeCommand', { command: activeCommandLabel })
    : t('history.chat.title')

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-3 py-2.5">
        <div className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bot className="h-3.5 w-3.5" />
        </div>
        <span className="text-sm font-medium text-foreground">{headerTitle}</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 && !isLoading ? (
          <div className="flex h-full flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Bot className="mb-3 h-8 w-8 opacity-30" />
            <p className="text-sm text-foreground/70">{t('history.chat.emptyTitle')}</p>
            <p className="mt-1 max-w-[200px] text-xs text-muted-foreground/60">
              {t('history.chat.emptyDesc')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isLoading ? (
              <div className="flex gap-2">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-secondary/60 px-3 py-2">
                  <Spinner className="size-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {t('history.chat.thinking')}
                  </span>
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} aria-hidden />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border/40 p-3">
        {pendingAttachments.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {pendingAttachments.map((att) => (
              <AttachmentChip
                key={att.id}
                attachment={att}
                removable
                removeLabel={t('history.chat.removeAttach')}
                onRemove={() => removePendingAttachment(att.id)}
              />
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            aria-hidden
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            title={t('history.chat.attach')}
            aria-label={t('history.chat.attach')}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              systemPrompt ? t('history.chat.inputPlaceholder') : t('history.chat.selectCommand')
            }
            rows={1}
            className="min-h-8 max-h-[120px] resize-none border-transparent bg-secondary/30 py-2 focus:bg-background"
            disabled={isLoading || !systemPrompt}
          />
          <Button
            type="button"
            size="icon-sm"
            className="shrink-0"
            onClick={() => void handleSend()}
            disabled={!canSend}
            title={t('history.chat.send')}
            aria-label={t('history.chat.send')}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground/50">{t('history.chat.hint')}</p>
      </div>
    </div>
  )
})
ChatPanel.displayName = 'ChatPanel'
