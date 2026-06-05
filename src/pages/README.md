# pages/

路由页面组件目录。

## 文件

- `HomePage.tsx` - 首页仪表盘：`pt-6` 顶留白；PTT 提示、历史统计与趋势图。
- `SketchesPage.tsx` - 闪记工作台：`pt-3` 顶留白；IPC/SQLite、分片播放下载；右侧「总结」Tab 为可编辑 `Textarea`、复制按钮与防抖写回 `updateFlashSummary`。
- `SettingsPage.tsx` - 设置页：主布局滚动区 `pt-0`；Tab 吸顶条 `py-3`、`border-b`，`TabsTrigger` `text-sm` / `h-8`；`TabsContent` `mt-4`；应用偏好 / 大模型（语音识别 + **文本识别 DashScope text-generation**）/ 存储 / 快捷键 / **诊断**（`runDiagnostics` + `getUserMedia` 麦克风，结果顺序：网络→麦克风→ASR→文本→归档）/ 关于；保存 `app` / `asr` / `erpnextcnDty` / `textLlm`。
- `HistoryPage.tsx` - 工匠页（路由 `/history`）：工具栏条数右侧小图标可折叠/展开右侧占位面板（默认收起）；展开后可拖动中间分隔条调整比例（默认 50/50，单侧最小 25%）；左侧转录历史（最多 10 条、搜索/排序/分组；条目元信息行：左时间常显，悬停时中间显示润色/总结/翻译/微信/推特/邮件，右侧复制/删除）；状态持久化 `localStorage`。
