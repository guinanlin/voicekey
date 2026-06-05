import { ReactNode, useCallback, useEffect, useState } from 'react'
import {
  Home,
  History,
  Minus,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Square,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import voiceKeyLogo from '@/assets/page-logo.png'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const SIDEBAR_COLLAPSED_KEY = 'voicekey-sidebar-collapsed'

function readSidebarCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    if (stored === null) return true
    return stored === '1'
  } catch {
    return true
  }
}

interface MainLayoutProps {
  children: ReactNode
  currentRoute: string
}

export default function MainLayout({ children, currentRoute }: MainLayoutProps) {
  const { t } = useTranslation()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed)
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        /* ignore quota / private mode */
      }
      return next
    })
  }, [])
  const isMac =
    window.electronAPI?.platform === 'darwin' ||
    (window.electronAPI === undefined && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent))
  const sidebarShortcutLabel = isMac ? '⌘B' : 'Ctrl+B'

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'b') return
      const toggleMod = isMac ? e.metaKey : e.ctrlKey
      if (!toggleMod || e.altKey || e.shiftKey) return
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      toggleSidebar()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isMac, toggleSidebar])

  const navigate = (path: string) => {
    window.location.hash = path
  }
  const navItems = [
    { path: '/home', label: t('nav.home'), icon: Home },
    { path: '/sketches', label: t('nav.sketches'), icon: NotebookPen },
    { path: '/history', label: t('nav.craftsman'), icon: History },
    { path: '/settings', label: t('nav.settings'), icon: Settings },
  ]

  return (
    <div className="flex flex-col h-screen w-screen bg-sidebar rounded-2xl overflow-hidden border border-sidebar-border">
      {/* 顶部标题栏 - 包含 logo 和标题 */}
      <div
        className={`drag-region h-8 shrink-0 bg-sidebar flex items-center justify-between ${
          isMac ? 'pl-20' : 'pl-4'
        } pr-4 border-b border-sidebar-border`}
      >
        {/* Logo 和标题 - 左侧对齐 */}
        <div className="no-drag flex items-center gap-2">
          <img src={voiceKeyLogo} alt={t('app.name')} className="w-4 h-4 shrink-0" />
          <span className="font-semibold text-sidebar-foreground text-sm leading-none">
            {t('app.name')}
          </span>
        </div>
        {/* Windows/Linux 窗口控制按钮区域 */}
        {!isMac && (
          <div className="no-drag flex items-center gap-px">
            <button
              onClick={() => window.electronAPI?.minimizeWindow?.()}
              className="w-6 h-6 flex items-center justify-center hover:bg-sidebar-accent rounded-sm transition-colors group"
              title={t('window.minimize')}
            >
              <Minus className="w-3 h-3 text-sidebar-foreground/70 group-hover:text-sidebar-foreground" />
            </button>
            <button
              onClick={() => window.electronAPI?.maximizeWindow?.()}
              className="w-6 h-6 flex items-center justify-center hover:bg-sidebar-accent rounded-sm transition-colors group"
              title={t('window.maximize')}
            >
              <Square className="w-2.5 h-2.5 text-sidebar-foreground/70 group-hover:text-sidebar-foreground" />
            </button>
            <button
              onClick={() => window.electronAPI?.closeWindow?.()}
              className="w-6 h-6 flex items-center justify-center hover:bg-red-500 hover:text-white rounded-sm transition-colors group"
              title={t('window.close')}
            >
              <X className="w-3 h-3 text-sidebar-foreground/70 group-hover:text-white" />
            </button>
          </div>
        )}
      </div>

      {/* 主区域 - 左右分栏 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：侧边栏 */}
        <aside
          className={cn(
            'flex min-h-0 shrink-0 flex-col overflow-hidden bg-sidebar transition-[width] duration-200 ease-out',
            sidebarCollapsed ? 'w-14' : 'w-52',
          )}
        >
          {/* 仅包裹菜单项，避免 flex-1 把 <nav> 拉满产生大块“另一层”视觉 */}
          <nav
            className={cn(
              'shrink-0 bg-sidebar py-2',
              sidebarCollapsed ? 'flex flex-col items-center gap-1 px-0' : 'px-3',
            )}
          >
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive =
                currentRoute === item.path ||
                (currentRoute === '/' && item.path === '/home') ||
                (currentRoute === '/settings' && item.path === '/settings')
              return (
                <button
                  key={item.path}
                  type="button"
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => navigate(item.path)}
                  className={cn(
                    'no-drag flex cursor-pointer items-center rounded-lg text-sm font-medium transition-colors',
                    sidebarCollapsed
                      ? 'size-9 shrink-0 justify-center p-0'
                      : 'mb-1 w-full gap-3 px-3 py-2',
                    isActive
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </button>
              )
            })}
          </nav>

          {/* 与侧栏同色伸展区，把版本栏顶到底部，无多余“灰带” */}
          <div className="min-h-0 flex-1 bg-sidebar" aria-hidden />

          {/* 版本 + 折叠/展开（无顶边线，与上方同色避免“多一块灰底”） */}
          <div
            className={cn(
              'flex shrink-0 items-center gap-1 bg-sidebar py-2',
              sidebarCollapsed ? 'justify-center px-0' : 'justify-between px-3',
            )}
          >
            {!sidebarCollapsed && (
              <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {t('app.version', { version: __APP_VERSION__ })}
              </p>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className="no-drag flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  aria-expanded={!sidebarCollapsed}
                  aria-label={
                    sidebarCollapsed ? t('layout.expandSidebar') : t('layout.collapseSidebar')
                  }
                >
                  {sidebarCollapsed ? (
                    <PanelLeftOpen className="size-4" aria-hidden />
                  ) : (
                    <PanelLeftClose className="size-4" aria-hidden />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={6}>
                {sidebarCollapsed
                  ? t('layout.expandSidebarTooltip', { shortcut: sidebarShortcutLabel })
                  : t('layout.collapseSidebarTooltip', { shortcut: sidebarShortcutLabel })}
              </TooltipContent>
            </Tooltip>
          </div>
        </aside>

        {/* 右侧：页面内容（flex 链 + min-h-0 让子页面可用 flex-1 / h-full 吃满高度） */}
        <main className="flex min-h-0 flex-1 flex-col pl-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-background">
            {/* 顶无 padding（pt-0）；左右 px-4；底 pb-6；各路由页自行 pt-6 */}
            <div className="flex min-h-0 flex-1 flex-col overflow-auto px-4 pb-6 pt-0">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
