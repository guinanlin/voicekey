import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Server, CheckCircle2, AlertCircle, XCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface ServiceStatus {
  status: 'ready' | 'warning' | 'error' | 'disabled'
  message: string
  permission: boolean
}

const PORT = 4321
const LOCAL_URL = `http://localhost:${PORT}`
const CLIPBOARD_PATH = '/clipboard'

export default function ServiceStatusCard() {
  const [localIP, setLocalIP] = useState<string>('')
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null)
  const [loading, setLoading] = useState(true)

  // 获取本机IP地址
  useEffect(() => {
    const fetchLocalIP = async () => {
      try {
        const ip = await window.electronAPI?.getLocalIP?.()
        if (ip) setLocalIP(ip)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to get local IP:', error)
      }
    }
    fetchLocalIP()
  }, [])

  // 获取服务状态
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        setLoading(true)
        const response = await fetch(`${LOCAL_URL}/clipboard/status`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (response.ok) {
          const data = await response.json()
          setServiceStatus(data)
        } else {
          // 如果响应不OK，尝试解析错误信息
          let errorMessage = '无法连接到服务'
          try {
            const errorData = await response.json()
            errorMessage = errorData.message || errorMessage
          } catch {
            // 忽略JSON解析错误
          }
          setServiceStatus({
            status: 'error',
            message: errorMessage,
            permission: false,
          })
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch service status:', error)
        // 检查是否是网络错误（服务器未启动）
        if (error instanceof TypeError && error.message.includes('fetch')) {
          setServiceStatus({
            status: 'error',
            message: '服务未启动或无法访问',
            permission: false,
          })
        } else {
          setServiceStatus({
            status: 'error',
            message: error instanceof Error ? error.message : '服务不可用',
            permission: false,
          })
        }
      } finally {
        setLoading(false)
      }
    }

    // 立即执行一次
    fetchStatus()
    // 每5秒刷新一次状态
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  const getStatusIcon = () => {
    if (loading) return null
    switch (serviceStatus?.status) {
      case 'ready':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />
      case 'error':
      case 'disabled':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return null
    }
  }

  const getStatusText = () => {
    if (loading) return '检查中...'
    switch (serviceStatus?.status) {
      case 'ready':
        return '服务正常'
      case 'warning':
        return '服务警告'
      case 'error':
        return '服务错误'
      case 'disabled':
        return '服务已禁用'
      default:
        return '未知状态'
    }
  }

  const localNetworkUrl = localIP ? `http://${localIP}:${PORT}${CLIPBOARD_PATH}` : ''
  const qrCodeValue = localNetworkUrl || LOCAL_URL + CLIPBOARD_PATH

  return (
    <Card className="gap-1.5 py-2.5 h-full flex flex-col w-full">
      <CardHeader className="space-y-0.5 pb-0 flex-shrink-0">
        <CardDescription className="flex items-center gap-2 text-xs">
          <Server className="h-3.5 w-3.5 text-muted-foreground" />
          服务状态
        </CardDescription>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-xl">{getStatusText()}</CardTitle>
            {getStatusIcon()}
          </div>
          {qrCodeValue && (
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="bg-white p-1 rounded border flex-shrink-0 cursor-pointer transition-shadow hover:ring-2 hover:ring-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title="点击放大二维码"
                  aria-label="点击放大二维码"
                >
                  <QRCodeSVG value={qrCodeValue} size={50} level="M" />
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>扫描二维码</DialogTitle>
                  <DialogDescription>使用手机扫描访问剪贴板服务</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col items-center gap-3">
                  <div className="bg-white p-3 rounded border">
                    <QRCodeSVG value={qrCodeValue} size={256} level="M" />
                  </div>
                  <p className="text-xs font-mono text-muted-foreground break-all text-center">
                    {qrCodeValue}
                  </p>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2 flex-1 flex flex-col justify-between">
        <div className="space-y-2">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">本地地址:</div>
            <div className="text-xs font-mono bg-muted px-2 py-0.5 rounded break-all">
              {LOCAL_URL}
            </div>
            {localIP && (
              <>
                <div className="text-xs text-muted-foreground">局域网地址:</div>
                <div className="text-xs font-mono bg-muted px-2 py-0.5 rounded break-all">
                  http://{localIP}:{PORT}
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
