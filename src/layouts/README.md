# layouts/

应用布局容器目录，定义应用的整体结构和导航框架。

## 文件

### `MainLayout.tsx`

应用主布局组件，提供：

- **顶部拖拽区域** - macOS 窗口拖动支持（仅 macOS）
- **左侧边栏** - 导航仅包裹菜单项；`flex-1` 同色占位顶开底部栏，避免高 `nav` 产生分层感；版本行右侧折叠/展开（`PanelLeftClose` / `PanelLeftOpen`，`w-52` ↔ `w-14`，`localStorage`；`Ctrl+B` / `⌘B` 切换；Tooltip 含快捷键）
- **右侧内容区** - `main` 为 `flex min-h-0 flex-1 flex-col`；内层圆角区与 `overflow-auto` 容器同为 `flex min-h-0 flex-1 flex-col`；滚动区 `px-4 pb-6 pt-0`（顶无内边距；各页自行 `pt-6`），`pl-0`
- **路由导航** - 基于 hash 路由的页面切换逻辑；侧栏顺序为首页 → 闪记（`/sketches`）→ 设置 → 历史

所有页面组件通过 `MainLayout` 包裹，确保统一的视觉和交互体验。
