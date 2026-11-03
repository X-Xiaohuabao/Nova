# TeaCoder UI 模式规范（设置中心 · 弹层 · 快捷键）

- 版本: v1.0（2026-11-03）
- 性质: TeaCoder 特定 UI 模式的权威定义；通用设计基准见 macos-hig skill
- 依据: 用户要求补齐 4 项缺口（设置中心布局 / 响应式弹层 / 快捷键总表+平台差异 / 图标体系）

## 1. 设置中心布局规范（T8/T9/T10 骨架依据）

### 1.1 整体结构（macOS 系统设置式）

```
┌───────────┬──────────────────────────────┐
│ 分类导航    │  内容面板                      │
│ (200px)   │  ┌──────────────────────────┐│
│ □ 通用     │  │ 页标题 (15px semibold)    ││
│ □ CLI 工具 │  │ ─ Section 分组 ────────   ││
│ □ 供应商   │  │  SettingRow [label|控件]  ││
│ □ 网络     │  │  SettingRow [label|控件]  ││
│ □ 系统     │  │ ─ Section 分组 ────────   ││
│ □ 关于     │  └──────────────────────────┘│
└───────────┴──────────────────────────────┘
```

- 左侧分类导航 200px（图标 16px + 文字 13px，行高 28px，选中 accent 高亮——复用侧栏语言）
- 内容面板：**max-width 640px 居中**（表单列可读性基准），滚动独立
- 通用件沿用旧概念新实现：`SettingRow`（label 左 / 控件右对齐，行高 36px）、`SectionHeader`（11px muted 分组标题）、`SettingsSearchBar`

### 1.2 分类归组（17 页定稿：G9 同步、G10 AI 补全已移除）

| 分组 | 页面 |
| --- | --- |
| **通用** | GeneralSettings（含主题/字体/语言）、Keybindings（全局快捷键） |
| **CLI 工具** | Claude、Codex、Gemini、OpenCode、Antigravity、CliShell、Terminal、MCP |
| **供应商与账号** | LlmProviders、ProfileManagement |
| **网络** | Network、RemoteAccess |
| **系统** | Notification、DataManagement |
| **关于** | About |

### 1.3 搜索定位

- 顶部全局搜索框（导航上方），匹配**页名 + 设置项标签**；结果下拉列表（页名 → 命中项），点击 = 切到该页 + 滚动至该项 + 高亮 1.5s
- 搜索数据源：静态索引（构建期由资源键生成，含 i18n 两语言）——不扫 DOM

### 1.4 移动端（<768px）

- 分类导航收为顶部下拉（Select 风格页切换，不占用抽屉——抽屉留给主侧栏）
- 内容面板全宽，边距 16px；`SettingRow` 在窄屏改为上下堆叠（label 上 / 控件下）

## 2. 响应式弹层策略（T5 组件定制 / T12 弹窗组依据）

| 弹层类型 | ≥768px | <768px |
| --- | --- | --- |
| **AlertDialog（确认框）** | 居中小卡 `max-w-sm` | **保持居中小卡不变**（确认必须醒目，不做 Sheet） |
| **Dialog（表单/内容弹窗）** | 居中 Dialog（max-w 480/560/640 按内容档位） | **底部 Sheet**：全宽滑入、顶部圆角 12px + 拖拽把手、高度 ≤85vh 内部滚动 |
| **DropdownMenu / Select** | shadcn 默认定位 | 同左（popover 定位自适应；不做 native select） |
| **Popover** | 锚定跟随 | 同左 |
| **Tooltip** | hover 显示 | **禁用**（无 hover；改直接可见的辅助文字） |

- 实现：封装 **`ResponsiveDialog`**（T5 落地）——内容一处声明，按断点渲染 Dialog 或 Sheet 双壳；所有表单弹窗一律经它，禁止直接裸用 Dialog
- Sheet 关闭：遮罩点击 / 把手下拉（>80px）/ Esc；Dialog 关闭沿用三方式（macos-hig 7.4）

## 3. 快捷键总表（权威键位 · 全局唯一真相源）

### 3.1 固定键位（应用内，不可自定义）

| 功能 | macOS | Windows / Linux | 状态 |
| --- | --- | --- | --- |
| 新建标签 | ⌘T | Ctrl+T | 已有 |
| 关闭当前标签 | ⌘W | Ctrl+W | 已有 |
| 直达标签 1~9 | ⌘1~9 | Ctrl+1~9 | T7 新增 |
| 前后标签切换 | ⌘⇧[ / ⌘⇧] | Ctrl+Tab / Ctrl+⇧Tab | 已有（补 mac 形式） |
| 会话内搜索 | ⌘F | Ctrl+F | T7 |
| 快速切换会话 | ⌘P | Ctrl+P | 已有（语义定为 QuickSwitch） |
| 打开设置 | ⌘, | Ctrl+, | 新增（macOS 惯例） |
| 停止生成 / 关闭弹层 | Esc | Esc | 聊天规范已定 |
| 输入区换行 | ⇧Enter | ⇧Enter | 聊天规范已定 |

### 3.2 可自定义键位（KeybindingsPage 管理）

- 仅**系统级全局键**可自定义：显示/隐藏窗口等（现状保留）
- 应用内固定键位**不开放自定义**（与 macOS 哲学一致：应用内键位由应用定义）

### 3.3 平台修饰键显示规范（强制）

- 检测：统一 `getPlatform(): "macos" | "windows" | "linux"` 工具（编码时落 `src/lib/shortcut.ts`）
- 显示映射（**禁止硬编码** "Ctrl+"/"⌘" 字面量，一律经 `formatShortcut(keys)` 渲染）：

| 修饰键 | macOS 显示 | Windows/Linux 显示 |
| --- | --- | --- |
| Meta | ⌘ | Ctrl |
| Alt | ⌥ | Alt |
| Shift | ⇧ | ⇧ |
| Control | ⌃ | Ctrl（合并展示，如 Ctrl+Shift+T） |

- KeybindingsPage、菜单右列、Tooltip 中的快捷键展示全部走该函数

### 3.4 运行时环境差异（web-remote 降级规则）

- 桌面专属键位（⌘W/⌘N/⌘P 等**与浏览器行为冲突**的）在 **web-remote 不注册**——浏览器行为优先，UI 提供等效按钮（关闭钮/新建钮）
- 判定经 `runtimeKind()`，注册逻辑集中在 useKeyboardShortcuts 重构时按平台/运行时过滤

### 3.5 冲突审计结论

- ⌘P：桌面 Tauri 需 `preventDefault`（防 webview 打印）；web-remote 不注册 → 无冲突
- ⌘T/⌘W：桌面 Tauri 安全；web-remote 不注册（浏览器标签行为）→ 无冲突
- ⌘F：桌面需 preventDefault（防 webview 页内查找 UI）；web-remote 可注册（页内查找被我们的搜索替代，可接受）
- ⌘1~9：与浏览器"切换到第 N 个标签页"冲突 → 桌面 preventDefault；web-remote 不注册

## 4. 图标体系细则（详见 shadcn-ui skill「图标」节，此处摘要）

- **lucide 优先**：通用图标一律 lucide-react，禁止第二套通用图标库，**禁止新增 PNG 图标**
- CLI 品牌标识 = **lucide 抽象图标 + 品牌色**（摆脱 PNG）：claude=Sparkles 紫、codex=SquareCode 蓝、gemini=Gem 蓝、opencode=Code2 橙、terminal=SquareTerminal 绿、ssh=Cable 蓝
- 尺寸档位：14（行内/标签）/ 16（按钮/菜单）/ 20（空态）；strokeWidth 2
- AntD → lucide 映射表见 shadcn-ui skill（迁移查阅用）
