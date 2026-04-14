# VoiceKey Windows 端自动升级评估报告

**范围**：仅讨论 Windows 场景下「在应用内完成检查、下载、安装」，而非跳转到浏览器手动下载安装包。  
**结论摘要**：技术上完全可行；仓库已具备 `electron-updater` + GitHub Releases 发布链路的主体能力。落地质量主要取决于**发版产物是否完整**、**代码签名与 SmartScreen**、以及**产品策略（静默/手动确认）**。

---

## 1. 现状（基于当前代码与构建配置）

### 1.1 技术栈

| 能力           | 实现                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| 运行时更新     | `electron-updater`（`electron/main/updater-manager.ts`）                                                     |
| 更新元数据来源 | `autoUpdater.setFeedURL({ provider: 'github', owner, repo })`，与 `electron-builder.json5` 中 `publish` 一致 |
| Windows 安装包 | NSIS（`electron-builder.json5` → `win.target: nsis`）                                                        |
| 应用内入口     | 设置页「关于」：`checkForUpdates` / `downloadUpdate` / `installUpdate`（`SettingsPage.tsx` + IPC）           |

### 1.2 当前行为特点

- **打包环境**：通过 `electron-updater` 走官方更新通道（依赖 Release 中的 `latest.yml` 与对应 `exe` 等产物）。
- **开发环境**：`app.isPackaged === false` 时用 GitHub API 做版本比对，**不能**在应用内完成真实增量下载与安装（设计如此）。
- **策略**：`autoDownload = false`、`autoInstallOnAppQuit = false`——更新由用户显式触发下载与安装，而非后台静默拉取。

### 1.3 与「不用去网页下 exe」的关系

「去网页下载」与「应用内自动升级」的差别主要在于 **下载与安装动作的发起位置**：

- 若 Release 配置正确，用户可在应用内完成：**检查 → 下载 → 安装重启**，无需打开浏览器找安装包。
- 若检查失败、下载失败、或未发布可被 updater 识别的产物，UI 仍会回退到「打开 Releases 页面」类体验（例如通过 `releaseUrl`）。

---

## 2. Windows 下自动升级的典型实现路径

对基于 **electron-builder + NSIS** 的应用，社区主流路径是：

1. CI 或本地执行带 `publish` 的构建，向 GitHub Releases（或自建更新服务器）上传：
   - `latest.yml`（Windows 更新清单）
   - 本次版本的 NSIS 安装包（如 `VoiceKey-Windows-x.x.x-Setup.exe`）
   - 可选：`blockmap` 等用于差分的文件（取决于配置）
2. 客户端 `electron-updater` 拉取 `latest.yml`，比对版本后下载对应 `exe`，下载完成后调用 `quitAndInstall` 走 NSIS 覆盖安装。

VoiceKey 的 `UpdaterManager` 已包含 `checkForUpdates`、`downloadUpdate`、`quitAndInstall` 等关键步骤，**与上述标准路径一致**。

---

## 3. 难点与风险

### 3.1 代码签名（高优先级）

未签名的 Windows 安装包会触发 **Microsoft Defender SmartScreen**「未知发布者」警告，用户可能不敢继续安装，表现为「自动升级不可用」或「体验极差」。

- **建议**：使用可信证书对 NSIS 安装包签名（Authenticode）；必要时对 `exe` 与安装器均签名。
- **影响**：属于发布与合规成本，不是代码逻辑问题。

### 3.2 发版产物必须「可被 updater 消费」

常见失败原因包括：

- Release 未附带 **`latest.yml`**，或 `yml` 中 URL 与实际 asset 不一致。
- 版本号与 tag 命名不符合 semver / electron-builder 预期，导致无法判定新版本。
- 只上传了「裸 exe」但未通过 electron-builder 的 publish 流程生成标准元数据。

**建议**：以一次真实预发版本在测试机验证：从旧版本应用内完整跑通「检查 → 下载 → 安装」。

### 3.3 私有仓库与鉴权

公共 GitHub 仓库通常无需额外配置。若为**私有仓库**，`electron-updater` 访问 Releases 可能需要配置 token（例如 `GH_TOKEN` / `setFeedURL` 的 token 选项），否则检查更新会失败。

### 3.4 安装权限与 NSIS 选项

当前 NSIS 配置为 `perMachine: false`（默认用户级安装），一般不需要管理员即可覆盖安装；若未来改为 `perMachine: true`，静默或覆盖安装可能触发 UAC，需要产品说明与测试。

### 3.5 网络环境

企业代理、严格防火墙可能拦截对 `github.com` 的访问。此类问题需运维侧排查或考虑**自建更新源**（generic server / S3 等）。

### 3.6 差分更新与体积

默认多为完整安装包下载。差分（differential）可减小流量，但配置与兼容性成本更高；MVP 阶段完整包通常足够。

### 3.7 许可证与分发

项目为 Elastic License 2.0，与「如何分发二进制」无直接技术冲突，但需确保 **Release 分发策略** 与公司/开源合规一致（属法务/产品范畴）。

---

## 4. 是否可解决？

| 问题                   | 可否解决                                                              |
| ---------------------- | --------------------------------------------------------------------- |
| 应用内检查并下载新版本 | ✅ 已具备基础实现                                                     |
| 应用内触发安装并重启   | ✅ `quitAndInstall` 路径已存在                                        |
| SmartScreen / 用户信任 | ✅ 需代码签名与品牌积累，非单靠开发可完全消除提示                     |
| 私有仓库更新           | ✅ 配置 token / 自建 feed                                             |
| 完全静默、零打扰升级   | ⚠️ 可做但涉及策略（后台下载、退出时安装、企业策略等），需单独产品设计 |

**总结**：从工程角度，Windows 下「应用内自动升级」是成熟方案；VoiceKey 当前架构**没有根本性障碍**，剩余工作主要是 **发布管线验证、签名、以及按产品意愿调整自动下载/安装策略**。

---

## 5. 建议的后续动作（供 T00 / 发版流程参考）

1. **发版检查清单**：确认每个 Windows Release 含 `latest.yml` 与对应 NSIS 安装包，且版本号连续可比对。
2. **在真实 Windows 环境回归**：旧版 → 新版一键升级全链路。
3. **代码签名**：评估证书采购与 CI 集成（签名命令接入 `electron-builder`）。
4. **（可选）体验优化**：在确认稳定后，可评估 `autoDownload` / `autoInstallOnAppQuit` 的渐进式开启，并保留用户控制开关。

---

## 6. 文档与代码索引

- 更新逻辑：`electron/main/updater-manager.ts`
- 构建与发布：`electron-builder.json5`（`publish`、`win`、`nsis`）
- 界面与 IPC：`src/pages/SettingsPage.tsx`、`electron/preload/preload.ts`

_本文档对应需求：Windows 端自动升级可行性、难点与现状评估。_
