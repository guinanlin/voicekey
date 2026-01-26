import { ReactNode } from 'react'
import { Home, Settings, History, Minus, Square, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import voiceKeyLogo from '@/assets/page-logo.png'

interface MainLayoutProps {
  children: ReactNode
  currentRoute: string
}

export default function MainLayout({ children, currentRoute }: MainLayoutProps) {
  const { t } = useTranslation()
  const navigate = (path: string) => {
    window.location.hash = path
  }
  const isMac = window.electronAPI.platform === 'darwin'
  const navItems = [
    { path: '/home', label: t('nav.home'), icon: Home },
    { path: '/settings', label: t('nav.settings'), icon: Settings },
    { path: '/history', label: t('nav.history'), icon: History },
  ]

  return (
    <div className="flex flex-col h-screen w-screen bg-sidebar rounded-2xl overflow-hidden">
      {/* 顶部标题栏 - 包含 logo 和标题 */}
      <div
        className={`drag-region h-12 shrink-0 bg-sidebar flex items-center justify-between ${
          isMac ? 'pl-20' : 'pl-4'
        } pr-4 border-b border-sidebar-border`}
      >
        {/* Logo 和标题 - 左侧对齐 */}
        <div className="no-drag flex items-center gap-2">
          <img src={voiceKeyLogo} alt={t('app.name')} className="w-5 h-5" />
          <span className="font-semibold text-sidebar-foreground text-sm">{t('app.name')}</span>
        </div>
        {/* Windows/Linux 窗口控制按钮区域 */}
        {!isMac && (
          <div className="no-drag flex items-center gap-0.5">
            <button
              onClick={() => window.electronAPI.minimizeWindow?.()}
              className="w-10 h-10 flex items-center justify-center hover:bg-sidebar-accent rounded transition-colors group"
              title={t('window.minimize')}
            >
              <Minus className="w-4 h-4 text-sidebar-foreground/70 group-hover:text-sidebar-foreground" />
            </button>
            <button
              onClick={() => window.electronAPI.maximizeWindow?.()}
              className="w-10 h-10 flex items-center justify-center hover:bg-sidebar-accent rounded transition-colors group"
              title={t('window.maximize')}
            >
              <Square className="w-3.5 h-3.5 text-sidebar-foreground/70 group-hover:text-sidebar-foreground" />
            </button>
            <button
              onClick={() => window.electronAPI.closeWindow?.()}
              className="w-10 h-10 flex items-center justify-center hover:bg-red-500 hover:text-white rounded transition-colors group"
              title={t('window.close')}
            >
              <X className="w-4 h-4 text-sidebar-foreground/70 group-hover:text-white" />
            </button>
          </div>
        )}
      </div>

      {/* 主区域 - 左右分栏 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：侧边栏 */}
        <aside className="w-52 bg-sidebar  border-sidebar-border  flex flex-col">
          {/* Logo */}
          {/* <div className="no-drag px-5 py-4 flex items-center gap-2">
            <div className="rounded-full w-10 h-10 overflow-hidden bg-white flex items-center justify-center">
              <img src={voiceKeyLogo} alt={t('app.name')} className="w-6 h-6" />
            </div>
            <span className="font-semibold text-sidebar-foreground">{t('app.name')}</span>
          </div> */}

          {/* 导航菜单 */}
          <nav className="flex-1 px-3 py-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive =
                currentRoute === item.path ||
                (currentRoute === '/' && item.path === '/home') ||
                (currentRoute === '/settings' && item.path === '/settings')
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`cursor-pointer no-drag w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-1 ${
                    isActive
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              )
            })}
          </nav>

          {/* 底部信息 */}
          <div className="p-4  border-t border-sidebar-border">
            <p className="text-xs text-muted-foreground">
              {t('app.version', { version: __APP_VERSION__ })}
            </p>
          </div>
        </aside>

        {/* 右侧：页面内容 */}
        <main className="flex-1 pl-3">
          {/* 外层：圆角 + 裁剪 */}
          <div className="h-full rounded-lg bg-background overflow-hidden">
            {/* 内层：滚动 + 内边距 */}
            <div className="h-full overflow-auto px-8 py-6">{children}</div>
          </div>
        </main>
      </div>
    </div>
  )
}
