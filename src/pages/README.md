# pages/

路由页面组件目录。

## 文件

- `HomePage.tsx` - 首页仪表盘：`pt-6` 顶留白；PTT 提示、历史统计与趋势图。
- `SketchesPage.tsx` - 闪记工作台：`pt-3` 顶留白；IPC/SQLite、分片播放下载；右侧「总结」Tab 为可编辑 `Textarea`、复制按钮与防抖写回 `updateFlashSummary`。
- `SettingsPage.tsx` - 设置页：主布局滚动区 `pt-0`；Tab 吸顶条 `py-3`、`border-b`，`TabsTrigger` `text-sm` / `h-8`；`TabsContent` `mt-4`；应用偏好 / 大模型（语音识别 + **文本识别**（渠道阿里云/天翼云，字段 Tooltip 提示））/ 存储 / 快捷键 / **指令**（`CommandSettings` 折叠编辑 Prompt）/ **诊断**（`runDiagnostics` + `getUserMedia` 麦克风，结果顺序：网络→麦克风→ASR→文本→归档）/ 关于；保存 `app` / `asr` / `erpnextcnDty` / `textLlm` / `voiceCommands`。
- `HistoryPage.tsx` - 工匠页（路由 `/history`）：工具栏条数右侧小图标可折叠/展开右侧 `ChatPanel`（默认收起）；左侧历史条目悬停指令按钮（润色/总结等）→ 展开右栏，按历史记录 ID + 指令 ID 恢复已保存会话或以对应 `voiceCommands` Prompt 首次发起聊天；展开后可拖动分隔条调比例；状态持久化 `localStorage`。
