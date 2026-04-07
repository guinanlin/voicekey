# pages/

路由页面组件目录。

## 文件

- `HomePage.tsx` - 首页仪表盘：显示 PTT 提示、历史统计汇总与区间趋势图。
- `SketchesPage.tsx` - 闪记工作台：接入主进程闪记 IPC 与 SQLite 数据；支持开始/结束会话、显示进行中时长、浏览分片状态/转写文本，并在分片行提供播放与下载动作；总结区在 P0 为占位展示。
- `SettingsPage.tsx` - 设置页：应用偏好（含 `audioCapture`：Opus 码率、单声道、回声消除、噪声抑制、自动增益 AGC、约束回退与组合告警）、大模型（GLM / 千问）、存储（ERPNextCN + 与录音设置联动说明）、快捷键、关于；保存写入 `app` / `asr` / `erpnextcnDty`。
- `HistoryPage.tsx` - 历史记录页：搜索/排序/分组展示，支持复制、删除与清空。
