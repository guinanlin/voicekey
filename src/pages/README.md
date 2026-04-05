# pages/

路由页面组件目录。

## 文件

- `HomePage.tsx` - 首页仪表盘：显示 PTT 提示、历史统计汇总与区间趋势图。
- `SettingsPage.tsx` - 设置页：应用偏好（含 `audioCapture`：Opus 码率、单声道/回声消除/降噪/约束回退）、大模型（GLM / 千问）、存储（ERPNextCN + 与录音设置联动说明）、快捷键、关于；保存写入 `app` / `asr` / `erpnextcnDty`。
- `HistoryPage.tsx` - 历史记录页：搜索/排序/分组展示，支持复制、删除与清空。
