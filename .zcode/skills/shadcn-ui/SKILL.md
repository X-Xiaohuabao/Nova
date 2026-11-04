---
name: shadcn-ui
description: |
  shadcn/ui + TailwindCSS 4 组件与样式规范、macOS 语义 token 体系。

  触发场景：
  - 引入/定制/使用 shadcn/ui 组件（按钮/表单/弹窗/下拉/标签页等）
  - Tailwind 样式、布局、间距、颜色
  - 主题 token、明暗主题、macOS 观感定制
  - 组件变体（CVA）、cn 用法、图标/Toast/确认交互方案选择
---

# shadcn/ui + TailwindCSS 规范（macOS 风格）

## 职责划分（强制）

- **shadcn/ui 管组件**：按钮、表单、弹窗、下拉、Tabs、命令面板等；组件源码进仓库（`src/components/ui/`），可自由定制，**禁止**整体引入 npm 组件库（AntD/MUI 等）替代
- **Tailwind 管样式**：布局（flex/grid）、间距（p/m/gap）、以及通过语义 token 引用颜色
- 🔴 **禁止硬编码色值**（`text-white`、`bg-[#141414]` 等）——一律用语义类（`bg-background`、`text-muted-foreground`、`border-border`）
- 🔴 **禁止深改 Radix UI 原语内部结构**；定制只通过 className / variant（CVA）进行
- 🔴 **禁止** `console.log` 进生产代码；**禁止** TODO/FIXME/HACK 注释

## 语义 token 体系（macOS 风格）

- token 定义在全局 CSS（`:root` + `.dark`），Tailwind 4 通过 `@theme inline` 映射为工具类
- 核心语义变量：`--background` `--foreground` `--card` `--popover` `--primary` `--secondary` `--muted` `--accent` `--destructive` `--border` `--input` `--ring` `--radius`
- 主题三态：深色（`.dark`）/ 浅色 / 跟随系统（`prefers-color-scheme` 探测 + 监听），切换即时生效并持久化到 store
- **禁止**为单个页面私设颜色变量；新颜色需求先归入语义 token 或 CVA variant

## 组件引入与目录约定

- 引入新组件：`pnpm exec shadcn@latest add <component>`，落在 `src/components/ui/`
- **业务定制直接改 ui/ 下源码**（这是 shadcn 的设计意图），但保持通用性：领域特殊样式写在业务组件处，不污染 ui/ 基件
- 业务组件放各自领域目录（`components/settings/`、`components/tabs/` 等），**禁止**业务逻辑进 `ui/`
- 路径别名统一 `@/`（tsconfig + vite 双侧配置），import 一律用 `@/components/ui/...`

## cn 工具与变体

- className 合并统一用 `cn()`（`@/lib/utils`，clsx + tailwind-merge）；**禁止**手写三元拼接
- 组件变体统一 CVA（class-variance-authority）：`buttonVariants` 模式，新增 variant 优先扩 variant 而不是新组件
- 布局/间距仍用 Tailwind 原子类；与组件自带样式冲突时用 `cn()` 覆盖方写在调用侧

## 方案锁定（禁止另起炉灶）

| 需求 | 唯一方案 | 禁止 |
| --- | --- | --- |
| 表单 | react-hook-form + zod + shadcn `Form` | AntD Form、手写校验散落 |
| 图标 | lucide-react（默认 14/16px，`strokeWidth` 2） | 多套图标库混用、**新增 PNG 图标** |
| 表单弹窗 | `ResponsiveDialog`（≥768px Dialog / <768px 底部 Sheet，内容一处声明双壳切换） | 裸用 Dialog 不做响应式 |
| Toast | sonner（全局挂一次，`toast.success/error()`） | message/notification 自实现 |
| 确认交互 | AlertDialog | 浏览器 `confirm()`、自造弹窗 |
| 设置分组 | `SettingsSection`（`settings/next/`，标题卡外 + 圆角色块卡 + hairline，Ventura 风格） | 裸行 + 分割线散排 |
| 按钮档位 | HIG：default 28px 蓝填充=主要动作 / outline=标准 push button / ghost=工具栏；按下 scale(0.98) | 各界面自定高度与配色 |
| 命令面板/自动补全 | command（cmdk） | 自造下拉搜索 |
| 文案 | react-i18next `t()`（`src/i18n/` 资源键） | 硬编码用户可见文案（含 aria-label） |

## macOS 观感基准（视觉一致性）

> 设计依据与完整参数表见 **macos-hig skill**（Apple HIG 摘译 + 落地值）；此处仅工程要点。

- 度量：标题栏 **38px**（unifiedCompact 档）、侧栏 200px、列表行高 28px、控件默认 28px
- 字号只用 **11 / 13 / 15px** 三档（13px 为默认正文）
- 控件圆角：小件 6px / 中件 8px（`--radius` 驱动），窗口级 10px
- 字体：SF 字体栈（system-ui 优先，中文回退 PingFang SC / Microsoft YaHei / Noto Sans CJK SC）
- 毛玻璃：仅壳层（Header/侧栏/状态条）`backdrop-blur` + 半透明背景（`bg-background/80` 一类 token 透明度写法）；**内容区实色**
- 分隔线：细线 `border-border`，1px；投影分三档（窗口大投影/浮层中投影/卡片微投影）
- 动效：hover 微高亮、active 微缩放（`scale-[0.98]`），过渡 100~150ms；弹层 200~250ms；复杂动效用 tw-animate-css 预设；尊重 `prefers-reduced-motion`

## 图标体系细则

- **lucide 优先**：通用图标一律 lucide-react；禁止引入第二套通用图标库；禁止新增 PNG 图标
- **CLI 品牌标识** = lucide 抽象图标 + 品牌色（`style={{ color }}`），摆脱 PNG：

| 工具 | lucide 图标 | 品牌色 |
| --- | --- | --- |
| Claude Code | Sparkles | `#722ed1` |
| Codex CLI | SquareCode | `#1890ff` |
| Gemini CLI | Gem | `#1677ff` |
| OpenCode | Code2 | `#fa8c16` |
| 终端 | SquareTerminal | `#52c41a` |
| SSH | Cable | `#1677ff` |

- 尺寸档位：**14px**（行内/标签）/ **16px**（按钮/菜单）/ **20px**（空态）；`strokeWidth` 2
- **AntD → lucide 迁移映射表**（旧组件迁移查阅，遇到表外图标按语义就近选择并回填本表）：

| AntD | lucide | AntD | lucide |
| --- | --- | --- | --- |
| PlusOutlined | Plus | CloseOutlined | X |
| EditOutlined | Pencil | DeleteOutlined | Trash2 |
| SearchOutlined | Search | SettingOutlined | Settings |
| MenuOutlined | Menu | ReloadOutlined | RotateCw |
| CopyOutlined | Copy | CheckOutlined | Check |
| DesktopOutlined | Monitor | CloudOutlined | Cloud |
| CodeOutlined | Code | LoadingOutlined | LoaderCircle（+spin） |
| FileOutlined | FileText | FolderOutlined | Folder |
| FolderOpenOutlined | FolderOpen | DownOutlined | ChevronDown |
| RightOutlined | ChevronRight | LeftOutlined | ChevronLeft |
| UpOutlined | ChevronUp | EyeOutlined | Eye |
| EyeInvisibleOutlined | EyeOff | InfoCircleOutlined | Info |
| ExclamationCircleOutlined | CircleAlert | QuestionCircleOutlined | CircleHelp |

## 复用强制（macOS 观感统一）

- **一切 UI 优先复用 `src/components/ui/` 与已封装模式组件**（Button/SettingsSection/ResponsiveDialog/Toast…），禁止界面里散写按钮样式、分组样式——观感漂移即回退
- macOS 设计原则（HIG）为**强制规范**：设计决策依据见 macos-hig skill（三原则/度量/排版/颜色/材质/动效/交互七章），新 UI 交互先对照再动手
- 观感辅助类（`surface-blur`/`traffic-light`/`running-dot`）唯一定义在 `src/styles/observance.css`，由 `src/index.css` 引用；禁止在组件里复刻

## 检查清单

- [ ] 无硬编码色值，全部走语义 token
- [ ] 新组件经 `shadcn add` 引入，落在 `src/components/ui/`，import 用 `@/`
- [ ] className 合并用 `cn()`，变体扩展用 CVA
- [ ] 表单/图标/Toast/确认交互符合方案锁定表
- [ ] 视觉符合 macOS 基准（圆角/密度/字体/毛玻璃）
- [ ] `pnpm exec tsc --noEmit` 通过
