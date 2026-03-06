# Electron 暴露的网络接口

## 概述

Voice Key 应用通过 HTTP 服务器暴露了一系列网络接口，供外部应用（如安卓应用）调用。这些接口主要用于剪贴板操作和文本输入功能。

## 服务器配置

### 端口号和地址

- **默认端口**: `4321`
- **默认地址**: `0.0.0.0`（监听所有网络接口，允许局域网访问）
- **本地访问**: `http://localhost:4321`
- **局域网访问**: `http://<本机IP>:4321`（如 `http://192.168.x.x:4321`）

### 配置方式

服务器配置在 `electron/main/main.ts` 中启动：

```typescript
await startHttpServer(4321, '0.0.0.0')
```

如需修改端口或地址，可以修改 `startHttpServer()` 函数的调用参数：

- **端口**: 第一个参数，默认 `4321`
- **地址**: 第二个参数，默认 `0.0.0.0`
  - `0.0.0.0` - 监听所有网络接口（允许局域网访问）
  - `127.0.0.1` 或 `localhost` - 仅允许本机访问

### API 文档

- **Swagger UI**: `http://localhost:4321/docs`
- **OpenAPI JSON**: `http://localhost:4321/docs/json`

## 接口列表

| 方法 | 路径                    | 功能     | 说明                                               |
| ---- | ----------------------- | -------- | -------------------------------------------------- |
| GET  | `/`                     | 接口索引 | 返回所有暴露的接口列表和服务信息                   |
| POST | `/clipboard/type`       | 文本输入 | 支持直接输入或仅同步到剪贴板，可配置后置按键       |
| POST | `/clipboard/key`        | 按键模拟 | 模拟按键操作，支持基础按键和组合键                 |
| GET  | `/clipboard/status`     | 服务状态 | 获取剪贴板服务状态（ready/warning/error/disabled） |
| GET  | `/clipboard/permission` | 权限检查 | 检查系统权限、平台支持和依赖可用性                 |
| GET  | `/clipboard/info`       | 服务信息 | 简单的服务可用性检查端点                           |

## 接口详情

### 1. GET / - 接口索引

**功能**: 返回所有暴露的接口列表和服务信息

**响应示例**:

```json
{
  "service": "Voice Key Clipboard API",
  "docs": "/docs",
  "openapi_json": "/docs/json",
  "endpoints": [
    "POST /clipboard/type - 文本输入",
    "POST /clipboard/key - 按键模拟",
    "GET /clipboard/status - 服务状态",
    "GET /clipboard/permission - 权限检查",
    "GET /clipboard/info - 服务信息检查"
  ]
}
```

---

### 2. POST /clipboard/type - 文本输入

**功能**: 文本输入接口，支持两种模式：直接输入或仅同步到剪贴板

**请求体**:

```json
{
  "text": "要输入的文本内容",
  "mode": "type", // 可选: "type" | "clipboard"，默认 "type"
  "after_key": "enter" // 可选: 输入后要按的按键，如 "enter", "tab", "ctrl_enter"
}
```

**响应**:

```json
{
  "success": true,
  "message": "文本输入成功"
}
```

**错误响应**:

- `400` - 参数无效（INVALID_PARAMETER）
- `403` - 权限不足（PERMISSION_DENIED）
- `503` - 服务不可用（SERVICE_DISABLED）
- `500` - 系统错误（SYSTEM_ERROR）

**模式说明**:

- `type`: 直接输入文本（需要系统权限，macOS 需要辅助功能权限）
- `clipboard`: 仅同步到剪贴板（无需权限）

---

### 3. POST /clipboard/key - 按键模拟

**功能**: 按键模拟接口，支持基础按键和组合键

**请求体**:

```json
{
  "key": "enter" // 按键名称，如 "enter", "tab", "backspace", "esc", "space", "ctrl_enter"
}
```

**支持的按键**:

- 基础按键: `enter`, `tab`, `backspace`, `esc`, `escape`, `space`
- 方向键: `up`, `down`, `left`, `right`
- 组合键: `ctrl_enter` (Ctrl+Enter)
- 其他: `home`, `end`, `pageup`, `pagedown`, `delete`

**响应**:

```json
{
  "success": true,
  "message": "按键 enter 模拟成功"
}
```

**错误响应**:

- `400` - 无效的按键名称（INVALID_PARAMETER）
- `403` - 权限不足（PERMISSION_DENIED）
- `500` - 系统错误（SYSTEM_ERROR）

---

### 4. GET /clipboard/status - 服务状态

**功能**: 获取剪贴板服务的当前状态

**响应**:

```json
{
  "status": "ready", // "ready" | "warning" | "error" | "disabled"
  "message": "剪贴板服务就绪",
  "permission": true
}
```

**状态说明**:

- `ready`: 服务就绪，权限正常
- `warning`: 服务可用但权限不足（可降级到剪贴板模式）
- `error`: 平台不支持或依赖缺失
- `disabled`: 服务被禁用

---

### 5. GET /clipboard/permission - 权限检查

**功能**: 检查系统权限、平台支持和依赖可用性

**响应**:

```json
{
  "has_permission": true,
  "platform_supported": true,
  "dependencies_available": true,
  "message": "权限正常"
}
```

**字段说明**:

- `has_permission`: 是否有键盘模拟权限（macOS 需要辅助功能权限）
- `platform_supported`: 平台是否支持（Windows/macOS/Linux 都支持）
- `dependencies_available`: nut-js 依赖是否可用
- `message`: 详细的权限状态描述

---

### 6. GET /clipboard/info - 服务信息

**功能**: 简单的服务可用性检查端点，用于健康检查

**响应** (服务可用时):

```json
{
  "status": "ok",
  "service": "clipboard"
}
```

**响应** (服务不可用时):

- 状态码: `503`

```json
{
  "status": "error",
  "detail": "服务不可用"
}
```

**说明**: 如果服务状态为 `ready` 或 `warning`，返回成功；否则返回 503。

---

## 错误码说明

| 错误码                 | HTTP 状态码 | 说明                                               |
| ---------------------- | ----------- | -------------------------------------------------- |
| PERMISSION_DENIED      | 403         | 权限不足（需要系统权限但未授权）                   |
| INVALID_PARAMETER      | 400         | 参数无效（空文本、超长文本、无效模式、无效按键等） |
| SERVICE_DISABLED       | 503         | 服务被禁用                                         |
| PLATFORM_NOT_SUPPORTED | 400         | 平台不支持                                         |
| DEPENDENCY_MISSING     | 503         | 依赖缺失（如 nut-js 不可用）                       |
| SYSTEM_ERROR           | 500         | 系统错误                                           |

## 使用示例

### cURL 示例

```bash
# 1. 检查接口索引
curl http://localhost:4321/

# 2. 检查服务状态
curl http://localhost:4321/clipboard/status

# 3. 检查权限
curl http://localhost:4321/clipboard/permission

# 4. 文本输入（直接输入模式）
curl -X POST http://localhost:4321/clipboard/type \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "type", "after_key": "enter"}'

# 5. 仅同步到剪贴板
curl -X POST http://localhost:4321/clipboard/type \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "clipboard"}'

# 6. 按键模拟
curl -X POST http://localhost:4321/clipboard/key \
  -H "Content-Type: application/json" \
  -d '{"key": "enter"}'

# 7. 组合键
curl -X POST http://localhost:4321/clipboard/key \
  -H "Content-Type: application/json" \
  -d '{"key": "ctrl_enter"}'
```

### JavaScript/TypeScript 示例

```typescript
const baseUrl = 'http://localhost:4321'

// 检查服务状态
const status = await fetch(`${baseUrl}/clipboard/status`).then((r) => r.json())
console.log(status)

// 文本输入
const result = await fetch(`${baseUrl}/clipboard/type`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: 'Hello, World!',
    mode: 'type',
    after_key: 'enter',
  }),
}).then((r) => r.json())
console.log(result)

// 按键模拟
const keyResult = await fetch(`${baseUrl}/clipboard/key`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: 'enter' }),
}).then((r) => r.json())
console.log(keyResult)
```

## 注意事项

1. **编码**: 所有请求和响应使用 UTF-8 编码
2. **权限**: macOS 需要用户手动授权辅助功能权限才能使用 `type` 模式
3. **平台差异**:
   - Windows: 使用剪贴板粘贴方式
   - macOS/Linux: 使用直接键盘输入
4. **局域网访问**: 服务器监听 `0.0.0.0`，允许局域网内其他设备访问
5. **安全性**: 当前实现未包含身份验证，建议仅在受信任的网络环境中使用

## 相关文件

- `electron/main/http-server.ts` - HTTP 服务器实现
- `electron/main/main.ts` - 服务器启动配置
- `electron/main/text-injector.ts` - 文本注入和按键模拟实现
- `docs/clipboard-api-design.md` - 剪贴板 API 设计文档
