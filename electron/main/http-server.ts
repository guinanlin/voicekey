import Fastify from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUI from '@fastify/swagger-ui'
import { textInjector } from './text-injector'

const fastify = Fastify({
  logger: {
    level: 'info',
  },
})

// 添加请求处理hook确保UTF-8编码正确处理
fastify.addHook('preHandler', async (_request, reply) => {
  // 确保响应使用UTF-8编码
  reply.header('Content-Type', 'application/json; charset=utf-8')
})

// 错误码到 HTTP 状态码的映射
function getHttpStatusCode(errorCode?: string): number {
  switch (errorCode) {
    case 'PERMISSION_DENIED':
      return 403
    case 'INVALID_PARAMETER':
      return 400
    case 'SERVICE_DISABLED':
      return 503
    case 'PLATFORM_NOT_SUPPORTED':
      return 400
    case 'DEPENDENCY_MISSING':
      return 503
    case 'SYSTEM_ERROR':
      return 500
    default:
      return 500
  }
}

// 注册所有路由（必须在 Swagger 插件之后注册；swagger 通过 onRoute 收集路由）
function registerRoutes() {
  // GET / - 接口索引，便于快速确认暴露的接口（使用相对路径，本地/远端访问均适用）
  fastify.get(
    '/',
    {
      schema: {
        operationId: 'index',
        summary: 'GET / - 接口索引',
        description: '返回所有暴露的接口列表',
        tags: ['clipboard'],
        response: {
          200: {
            type: 'object',
            properties: {
              service: { type: 'string' },
              docs: { type: 'string' },
              openapi_json: { type: 'string' },
              endpoints: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async () => ({
      service: 'Voice Key Clipboard API',
      docs: '/docs',
      openapi_json: '/docs/json',
      endpoints: [
        'POST /clipboard/type - 文本输入',
        'POST /clipboard/key - 按键模拟',
        'GET /clipboard/status - 服务状态',
        'GET /clipboard/permission - 权限检查',
        'GET /clipboard/info - 服务信息检查',
      ],
    }),
  )

  // POST /clipboard/type - 文本输入
  fastify.post(
    '/clipboard/type',
    {
      schema: {
        operationId: 'clipboardType',
        summary: 'POST /clipboard/type - 文本输入',
        description:
          '文本输入接口。支持 mode: type（直接输入）或 clipboard（仅同步到剪贴板）；可选 after_key 在输入后按指定键。',
        tags: ['clipboard'],
        body: {
          type: 'object',
          required: ['text'],
          properties: {
            text: {
              type: 'string',
              description: '要输入的文本内容',
            },
            mode: {
              type: 'string',
              enum: ['type', 'clipboard'],
              default: 'type',
              description: '输入模式：type=直接输入，clipboard=仅同步到剪贴板',
            },
            after_key: {
              type: 'string',
              description: '粘贴后要按的按键（可选），如 enter, tab, ctrl_enter',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              error: { type: 'string' },
              code: { type: 'string' },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
              code: { type: 'string' },
            },
          },
          403: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
              code: { type: 'string' },
            },
          },
          500: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
              code: { type: 'string' },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
              code: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        text: string
        mode?: 'type' | 'clipboard'
        after_key?: string
      }

      try {
        const result = await textInjector.typeText(body.text, body.mode || 'type', body.after_key)

        if (!result.success) {
          const statusCode = getHttpStatusCode(result.code)
          reply.code(statusCode)
          return result
        }

        return result
      } catch (error) {
        console.error('[HTTP Server] /clipboard/type error:', error)
        reply.code(500)
        return {
          success: false,
          error: error instanceof Error ? error.message : '服务器内部错误',
          code: 'SYSTEM_ERROR',
        }
      }
    },
  )

  // POST /clipboard/key - 按键模拟
  fastify.post(
    '/clipboard/key',
    {
      schema: {
        operationId: 'clipboardKey',
        summary: 'POST /clipboard/key - 按键模拟',
        description: '按键模拟接口。支持 enter, tab, backspace, esc, space, ctrl_enter 等。',
        tags: ['clipboard'],
        body: {
          type: 'object',
          required: ['key'],
          properties: {
            key: {
              type: 'string',
              description: '按键名称，如 enter, tab, backspace, esc, space, ctrl_enter',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              error: { type: 'string' },
              code: { type: 'string' },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
              code: { type: 'string' },
            },
          },
          403: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
              code: { type: 'string' },
            },
          },
          500: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
              code: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { key: string }

      try {
        const result = await textInjector.pressKeyFromString(body.key)

        if (!result.success) {
          const statusCode = getHttpStatusCode(result.code)
          reply.code(statusCode)
          return result
        }

        return result
      } catch (error) {
        console.error('[HTTP Server] /clipboard/key error:', error)
        reply.code(500)
        return {
          success: false,
          error: error instanceof Error ? error.message : '服务器内部错误',
          code: 'SYSTEM_ERROR',
        }
      }
    },
  )

  // GET /clipboard/status - 服务状态
  fastify.get(
    '/clipboard/status',
    {
      schema: {
        operationId: 'clipboardStatus',
        summary: 'GET /clipboard/status - 服务状态',
        description: '获取剪贴板服务状态（ready / warning / error / disabled）。',
        tags: ['clipboard'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['ready', 'warning', 'error', 'disabled'],
              },
              message: { type: 'string' },
              permission: { type: 'boolean' },
            },
          },
        },
      },
    },
    async () => {
      try {
        return textInjector.getStatus()
      } catch (error) {
        console.error('[HTTP Server] /clipboard/status error:', error)
        return {
          status: 'error',
          message: error instanceof Error ? error.message : '获取状态失败',
          permission: false,
        }
      }
    },
  )

  // GET /clipboard/permission - 权限检查
  fastify.get(
    '/clipboard/permission',
    {
      schema: {
        operationId: 'clipboardPermission',
        summary: 'GET /clipboard/permission - 权限检查',
        description: '检查系统权限、平台支持与依赖可用性。',
        tags: ['clipboard'],
        response: {
          200: {
            type: 'object',
            properties: {
              has_permission: { type: 'boolean' },
              platform_supported: { type: 'boolean' },
              dependencies_available: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async () => {
      try {
        return await textInjector.checkPermissionsExtended()
      } catch (error) {
        console.error('[HTTP Server] /clipboard/permission error:', error)
        return {
          has_permission: false,
          platform_supported: false,
          dependencies_available: false,
          message: error instanceof Error ? error.message : '权限检查失败',
        }
      }
    },
  )

  // GET /clipboard/info - 服务信息检查
  fastify.get(
    '/clipboard/info',
    {
      schema: {
        operationId: 'clipboardInfo',
        summary: 'GET /clipboard/info - 服务信息检查',
        description:
          '简单的服务信息检查端点（用于状态检查）。如果服务可用（ready 或 warning），返回成功；否则返回 503。',
        tags: ['clipboard'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              service: { type: 'string' },
            },
          },
          503: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              detail: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const statusInfo = textInjector.getStatus()
        // 如果服务可用（ready 或 warning），返回成功
        if (statusInfo.status === 'ready' || statusInfo.status === 'warning') {
          return { status: 'ok', service: 'clipboard' }
        } else {
          // 服务不可用，返回 503
          reply.code(503)
          return {
            status: 'error',
            detail: '服务不可用',
          }
        }
      } catch (error) {
        console.error('[HTTP Server] /clipboard/info error:', error)
        reply.code(503)
        return {
          status: 'error',
          detail: error instanceof Error ? error.message : '服务检查失败',
        }
      }
    },
  )
}

// 注册 Swagger 和 Swagger UI 插件（必须先于路由注册；swagger 通过 onRoute 收集后续注册的路由）
async function registerSwaggerPlugins() {
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Voice Key Clipboard API',
        description: '剪贴板/输入 API，供外部应用调用（如安卓应用）',
        version: '1.0.0',
      },
      servers: [
        {
          url: 'http://localhost:4321',
          description: '本地服务器（本机访问）',
        },
        {
          url: 'http://0.0.0.0:4321',
          description: '局域网服务器（可通过本机 IP 访问，如 http://192.168.x.x:4321）',
        },
      ],
      tags: [
        {
          name: 'clipboard',
          description: '剪贴板相关接口',
        },
      ],
    },
  })

  await fastify.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false,
    },
    staticCSP: false,
  })
}

// 启动 HTTP 服务器
export async function startHttpServer(port = 4321, host = '0.0.0.0') {
  try {
    await registerSwaggerPlugins()
    registerRoutes()
    await fastify.ready()
    await fastify.listen({ port, host })
    console.log(`[HTTP Server] 服务器启动: http://${host}:${port} (监听所有网络接口)`)
    console.log(`[HTTP Server] 本地访问: http://localhost:${port}`)
    console.log(`[HTTP Server] Swagger UI: http://localhost:${port}/docs`)
    console.log(`[HTTP Server] OpenAPI JSON: http://localhost:${port}/docs/json`)
    console.log(`[HTTP Server] 局域网访问: 使用本机 IP 地址，如 http://192.168.x.x:${port}`)
  } catch (err) {
    console.error('[HTTP Server] 启动失败:', err)
    throw err
  }
}

// 停止 HTTP 服务器
export async function stopHttpServer() {
  try {
    await fastify.close()
    console.log('[HTTP Server] 服务器已停止')
  } catch (err) {
    console.error('[HTTP Server] 停止失败:', err)
  }
}
