# pages/

路由页面组件目录。

## 文件

- `HomePage.tsx` - 首页仪表盘：`pt-6` 顶留白；PTT 提示、历史统计与趋势图。
- `SketchesPage.tsx` - 闪记工作台：`pt-3` 顶留白；IPC/SQLite、分片播放下载；右侧「总结」Tab 为可编辑 `Textarea`、复制按钮与防抖写回 `updateFlashSummary`。
- `SettingsPage.tsx` - 设置页：主布局滚动区 `pt-0`；Tab 吸顶条 `py-3`、`border-b`，`TabsTrigger` `text-sm` / `h-8`；`TabsContent` `mt-4`；应用偏好 / 大模型（语音识别 + **文本识别 DashScope text-generation**）/ 存储 / 快捷键 / **诊断**（`runDiagnostics` + `getUserMedia` 麦克风，结果顺序：网络→麦克风→ASR→文本→归档）/ 关于；保存 `app` / `asr` / `erpnextcnDty` / `textLlm`。
- `HistoryPage.tsx` - 历史记录页：`-mb-6` 底延伸；工具栏 `py-4` 上下对称；搜索/排序/分组、复制删除清空。
